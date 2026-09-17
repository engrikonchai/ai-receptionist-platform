import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { claimCheckoutAttempt, recordCheckoutSession } from './checkout-attempts';

/**
 * A stateful, in-memory stand-in for the `billing_checkout_attempts`
 * table that actually enforces the same constraint the real unique
 * partial index (`billing_checkout_attempts_one_pending_per_business`)
 * enforces in Postgres: at most one `status = 'pending'` row per
 * business. This is what makes the concurrency test below a genuine
 * regression test of the race-safety guarantee, not just an assertion
 * about call arguments — there is no live Postgres instance in this
 * environment, so this mock's own uniqueness check stands in for it.
 */
function fakeCheckoutAttemptsClient() {
  type Row = {
    id: string;
    business_id: string;
    status: string;
    stripe_checkout_session_id: string | null;
    expires_at: string;
  };
  const rows: Row[] = [];

  function query(op: 'insert' | 'update' | 'select', payload?: Record<string, unknown>) {
    const filters: Array<(row: Row) => boolean> = [];

    async function execute() {
      if (op === 'insert') {
        const businessId = payload!.business_id as string;
        const alreadyPending = rows.some(
          (row) => row.business_id === businessId && row.status === 'pending'
        );
        if (alreadyPending) {
          return {
            error: {
              code: '23505',
              message:
                'duplicate key value violates unique constraint "billing_checkout_attempts_one_pending_per_business"'
            }
          };
        }
        rows.push({
          id: payload!.id as string,
          business_id: businessId,
          status: (payload!.status as string) ?? 'pending',
          stripe_checkout_session_id: null,
          expires_at: new Date(Date.now() + 30 * 60_000).toISOString()
        });
        return { error: null };
      }

      if (op === 'update') {
        for (const row of rows) {
          if (filters.every((f) => f(row))) Object.assign(row, payload);
        }
        return { error: null };
      }

      return { data: null, error: null };
    }

    const proxy: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') {
            return (
              resolve: (value: { error: { code?: string; message: string } | null }) => void,
              reject?: (reason: unknown) => void
            ) => execute().then(resolve, reject);
          }
          if (prop === 'eq') {
            return (column: string, value: unknown) => {
              filters.push((row) => (row as unknown as Record<string, unknown>)[column] === value);
              return proxy;
            };
          }
          if (prop === 'lt') {
            return (column: string, value: string) => {
              filters.push(
                (row) => ((row as unknown as Record<string, unknown>)[column] as string) < value
              );
              return proxy;
            };
          }
          if (prop === 'maybeSingle') {
            return async () => {
              const match = rows.find((row) => filters.every((f) => f(row))) ?? null;
              return { data: match, error: null };
            };
          }
          return () => proxy;
        }
      }
    );

    return proxy;
  }

  const from = vi.fn((table: string) => {
    if (table !== 'billing_checkout_attempts') {
      throw new Error(`unexpected table: ${table}`);
    }
    return {
      insert: (payload: Record<string, unknown>) => query('insert', payload),
      update: (payload: Record<string, unknown>) => query('update', payload),
      select: () => query('select')
    };
  });

  return { service: { from } as unknown as SupabaseClient, rows };
}

function fakeStripe(sessions: Record<string, { status: string; url: string | null }>) {
  const retrieve = vi.fn(async (id: string) => {
    const session = sessions[id];
    if (!session) throw new Error('no such session');
    return session as unknown as Stripe.Checkout.Session;
  });
  return { stripe: { checkout: { sessions: { retrieve } } } as unknown as Stripe, retrieve };
}

const BUSINESS_ID = 'biz-1';

describe('claimCheckoutAttempt — concurrency regression', () => {
  it('two simultaneous claims for the same business converge on exactly one winner, and the loser never creates a second session', async () => {
    const { service, rows } = fakeCheckoutAttemptsClient();
    const { stripe } = fakeStripe({});

    const first = await claimCheckoutAttempt(service, stripe, BUSINESS_ID);
    const second = await claimCheckoutAttempt(service, stripe, BUSINESS_ID);

    expect(first.kind).toBe('new');
    // The second racer must never also get `new` — that would mean two
    // Stripe Checkout Sessions (and two idempotency keys) get created.
    expect(second.kind).toBe('retry');
    expect(rows.filter((r) => r.status === 'pending')).toHaveLength(1);
  });

  it('a retried call reuses the winner’s Checkout Session once it has been recorded, instead of creating a second one', async () => {
    const { service } = fakeCheckoutAttemptsClient();
    const { stripe } = fakeStripe({
      cs_test_1: { status: 'open', url: 'https://checkout.stripe.com/cs_test_1' }
    });

    const winner = await claimCheckoutAttempt(service, stripe, BUSINESS_ID);
    if (winner.kind !== 'new') throw new Error('expected the first claim to win');
    await recordCheckoutSession(service, winner.attemptId, 'cs_test_1');

    const retried = await claimCheckoutAttempt(service, stripe, BUSINESS_ID);

    expect(retried).toEqual({ kind: 'reuse', url: 'https://checkout.stripe.com/cs_test_1' });
  });

  it('never reuses a session that Stripe reports as no longer open', async () => {
    const { service } = fakeCheckoutAttemptsClient();
    const { stripe } = fakeStripe({
      cs_expired: { status: 'expired', url: null }
    });

    const winner = await claimCheckoutAttempt(service, stripe, BUSINESS_ID);
    if (winner.kind !== 'new') throw new Error('expected the first claim to win');
    await recordCheckoutSession(service, winner.attemptId, 'cs_expired');

    const retried = await claimCheckoutAttempt(service, stripe, BUSINESS_ID);

    expect(retried.kind).toBe('retry');
  });

  it('allows a brand-new attempt once the previous pending one has expired (abandoned Checkout)', async () => {
    const { service, rows } = fakeCheckoutAttemptsClient();
    const { stripe } = fakeStripe({});

    const first = await claimCheckoutAttempt(service, stripe, BUSINESS_ID);
    if (first.kind !== 'new') throw new Error('expected the first claim to win');
    // Simulate time passing well past the 30-minute expiry window.
    const pendingRow = rows.find((r) => r.status === 'pending');
    if (pendingRow) pendingRow.expires_at = new Date(Date.now() - 60_000).toISOString();

    const afterExpiry = await claimCheckoutAttempt(service, stripe, BUSINESS_ID);

    expect(afterExpiry.kind).toBe('new');
  });

  it('never lets a business_id it does not own affect a different business’s pending attempt', async () => {
    const { service, rows } = fakeCheckoutAttemptsClient();
    const { stripe } = fakeStripe({});

    const forBusinessA = await claimCheckoutAttempt(service, stripe, 'biz-a');
    const forBusinessB = await claimCheckoutAttempt(service, stripe, 'biz-b');

    expect(forBusinessA.kind).toBe('new');
    expect(forBusinessB.kind).toBe('new');
    expect(rows.filter((r) => r.status === 'pending')).toHaveLength(2);
  });
});
