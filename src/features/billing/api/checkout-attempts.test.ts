import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { claimCheckoutAttempt, recordCheckoutSession } from './checkout-attempts';

const syncSubscriptionFromStripe = vi.fn();
vi.mock('@/lib/stripe/sync', () => ({
  syncSubscriptionFromStripe: (...args: unknown[]) => syncSubscriptionFromStripe(...args)
}));

/**
 * A stateful, in-memory stand-in for the `billing_checkout_attempts`
 * table that actually enforces the same constraint the real unique
 * partial index (`billing_checkout_attempts_one_pending_per_business`)
 * enforces in Postgres: at most one `status = 'pending'` row per
 * business — and assigns a strictly monotonic `generation` on insert,
 * mirroring the real `generated always as identity` column. This is
 * what makes the concurrency tests below genuine regression tests of
 * the race-safety guarantee, not just assertions about call arguments —
 * there is no live Postgres instance in this environment, so this
 * mock's own uniqueness/generation logic stands in for it.
 */
function fakeCheckoutAttemptsClient() {
  type Row = {
    id: string;
    business_id: string;
    generation: number;
    status: string;
    stripe_checkout_session_id: string | null;
    expires_at: string;
  };
  const rows: Row[] = [];
  let nextGeneration = 1;

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
            data: null,
            error: {
              code: '23505',
              message:
                'duplicate key value violates unique constraint "billing_checkout_attempts_one_pending_per_business"'
            }
          };
        }
        const generation = nextGeneration++;
        rows.push({
          id: payload!.id as string,
          business_id: businessId,
          generation,
          status: (payload!.status as string) ?? 'pending',
          stripe_checkout_session_id: null,
          expires_at: payload!.expires_at as string
        });
        return { data: { generation }, error: null };
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
              resolve: (value: { data?: unknown; error: unknown }) => void,
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
          if (prop === 'maybeSingle' || prop === 'single') {
            return async () => {
              if (op === 'insert') return execute();
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

function fakeStripe(sessions: Record<string, Partial<Stripe.Checkout.Session>>) {
  const retrieve = vi.fn(async (id: string) => {
    const session = sessions[id];
    if (!session) throw new Error('no such session');
    return session as unknown as Stripe.Checkout.Session;
  });
  return { stripe: { checkout: { sessions: { retrieve } } } as unknown as Stripe, retrieve };
}

const BUSINESS_ID = 'biz-1';

beforeEach(() => {
  syncSubscriptionFromStripe.mockReset();
});

describe('claimCheckoutAttempt — new attempts', () => {
  it('assigns a monotonic generation and an expiresAt to a fresh claim', async () => {
    const { service } = fakeCheckoutAttemptsClient();
    const { stripe } = fakeStripe({});

    const claim = await claimCheckoutAttempt(service, stripe, BUSINESS_ID);

    expect(claim.kind).toBe('new');
    if (claim.kind !== 'new') throw new Error('expected new');
    expect(claim.generation).toBe(1);
    expect(claim.expiresAt.getTime()).toBeGreaterThan(Date.now());
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

describe('claimCheckoutAttempt — DB expiry vs. Stripe session state (item 1)', () => {
  it('reuses an open Stripe session even though the DB attempt’s own expires_at has already passed', async () => {
    const { service, rows } = fakeCheckoutAttemptsClient();
    const first = await claimCheckoutAttempt(service, fakeStripe({}).stripe, BUSINESS_ID);
    if (first.kind !== 'new') throw new Error('expected new');
    await recordCheckoutSession(service, first.attemptId, 'cs_open');
    // Simulate the DB row's own expires_at having already passed.
    rows[0]!.expires_at = new Date(Date.now() - 60_000).toISOString();

    const { stripe } = fakeStripe({
      cs_open: { status: 'open', url: 'https://checkout.stripe.com/cs_open' }
    });
    const claim = await claimCheckoutAttempt(service, stripe, BUSINESS_ID);

    expect(claim).toEqual({ kind: 'reuse', url: 'https://checkout.stripe.com/cs_open' });
  });

  it('never expires an attempt purely because its own timestamp passed, without checking the recorded Stripe session first', async () => {
    const { service, rows } = fakeCheckoutAttemptsClient();
    const first = await claimCheckoutAttempt(service, fakeStripe({}).stripe, BUSINESS_ID);
    if (first.kind !== 'new') throw new Error('expected new');
    await recordCheckoutSession(service, first.attemptId, 'cs_open');
    rows[0]!.expires_at = new Date(Date.now() - 60_000).toISOString();

    const { stripe, retrieve } = fakeStripe({
      cs_open: { status: 'open', url: 'https://checkout.stripe.com/cs_open' }
    });
    await claimCheckoutAttempt(service, stripe, BUSINESS_ID);

    // The claim consulted Stripe's own status before doing anything else.
    expect(retrieve).toHaveBeenCalledWith('cs_open');
    expect(rows[0]!.status).toBe('pending');
  });

  it('marks the attempt expired and allows a brand-new one only once Stripe itself reports the session expired', async () => {
    const { service, rows } = fakeCheckoutAttemptsClient();
    const first = await claimCheckoutAttempt(service, fakeStripe({}).stripe, BUSINESS_ID);
    if (first.kind !== 'new') throw new Error('expected new');
    await recordCheckoutSession(service, first.attemptId, 'cs_dead');

    const { stripe } = fakeStripe({ cs_dead: { status: 'expired', url: null } });
    const claim = await claimCheckoutAttempt(service, stripe, BUSINESS_ID);

    expect(claim.kind).toBe('new');
    expect(rows.find((r) => r.id === first.attemptId)?.status).toBe('expired');
    expect(rows.filter((r) => r.status === 'pending')).toHaveLength(1);
  });

  it('never allows a new attempt while the old Stripe session is still open, even long after expires_at', async () => {
    const { service, rows } = fakeCheckoutAttemptsClient();
    const first = await claimCheckoutAttempt(service, fakeStripe({}).stripe, BUSINESS_ID);
    if (first.kind !== 'new') throw new Error('expected new');
    await recordCheckoutSession(service, first.attemptId, 'cs_open');
    rows[0]!.expires_at = new Date(Date.now() - 60_000).toISOString();

    const { stripe } = fakeStripe({
      cs_open: { status: 'open', url: 'https://checkout.stripe.com/cs_open' }
    });
    const claim = await claimCheckoutAttempt(service, stripe, BUSINESS_ID);

    expect(claim.kind).not.toBe('new');
    expect(rows.filter((r) => r.status === 'pending')).toHaveLength(1);
  });
});

describe('claimCheckoutAttempt — a completed session is never replaced (item 1)', () => {
  it('reports already_subscribed and synchronizes the subscription when the recorded session completed and syncing succeeds', async () => {
    const { service, rows } = fakeCheckoutAttemptsClient();
    const first = await claimCheckoutAttempt(service, fakeStripe({}).stripe, BUSINESS_ID);
    if (first.kind !== 'new') throw new Error('expected new');
    await recordCheckoutSession(service, first.attemptId, 'cs_done');
    syncSubscriptionFromStripe.mockResolvedValue({ ok: true });

    const { stripe } = fakeStripe({
      cs_done: { status: 'complete', subscription: 'sub_1', url: null }
    });
    const claim = await claimCheckoutAttempt(service, stripe, BUSINESS_ID);

    expect(claim).toEqual({ kind: 'already_subscribed' });
    expect(syncSubscriptionFromStripe).toHaveBeenCalledWith(service, stripe, 'sub_1');
    expect(rows.find((r) => r.id === first.attemptId)?.status).toBe('completed');
  });

  it('reports processing, never creating a new Checkout, when the webhook/DB subscription row is delayed', async () => {
    const { service, rows } = fakeCheckoutAttemptsClient();
    const first = await claimCheckoutAttempt(service, fakeStripe({}).stripe, BUSINESS_ID);
    if (first.kind !== 'new') throw new Error('expected new');
    await recordCheckoutSession(service, first.attemptId, 'cs_done');
    // Synchronization hasn't caught up yet (e.g. a transient DB error, or
    // the webhook truly hasn't arrived and this is a best-effort inline
    // attempt at claim time).
    syncSubscriptionFromStripe.mockResolvedValue({ ok: false, reason: 'db_error' });

    const { stripe } = fakeStripe({
      cs_done: { status: 'complete', subscription: 'sub_1', url: null }
    });
    const claim = await claimCheckoutAttempt(service, stripe, BUSINESS_ID);

    expect(claim).toEqual({ kind: 'processing' });
    // Never creates a second Checkout Session — the pending row is
    // simply marked completed, not replaced.
    expect(rows.filter((r) => r.status === 'pending')).toHaveLength(0);
  });

  it('reports processing when a completed session has no subscription id to synchronize', async () => {
    const { service } = fakeCheckoutAttemptsClient();
    const first = await claimCheckoutAttempt(service, fakeStripe({}).stripe, BUSINESS_ID);
    if (first.kind !== 'new') throw new Error('expected new');
    await recordCheckoutSession(service, first.attemptId, 'cs_done');

    const { stripe } = fakeStripe({
      cs_done: { status: 'complete', subscription: null, url: null }
    });
    const claim = await claimCheckoutAttempt(service, stripe, BUSINESS_ID);

    expect(claim).toEqual({ kind: 'processing' });
    expect(syncSubscriptionFromStripe).not.toHaveBeenCalled();
  });
});

describe('claimCheckoutAttempt — recoverable session recording (item 2)', () => {
  it('resumes with the SAME attempt id/idempotency key when no session id was ever recorded', async () => {
    const { service } = fakeCheckoutAttemptsClient();
    const { stripe } = fakeStripe({});

    const first = await claimCheckoutAttempt(service, stripe, BUSINESS_ID);
    if (first.kind !== 'new') throw new Error('expected new');
    // Simulate: Stripe created the session, but recordCheckoutSession()
    // itself failed, so no session id ever landed in the DB.

    const retried = await claimCheckoutAttempt(service, stripe, BUSINESS_ID);

    expect(retried).toEqual({
      kind: 'resume',
      attemptId: first.attemptId,
      generation: first.generation,
      expiresAt: first.expiresAt
    });
  });

  it('a concurrent mid-flight caller (no session id recorded yet) also safely resumes rather than erroring or racing a new attempt', async () => {
    const { service } = fakeCheckoutAttemptsClient();
    const { stripe } = fakeStripe({});

    const winner = await claimCheckoutAttempt(service, stripe, BUSINESS_ID);
    const loser = await claimCheckoutAttempt(service, stripe, BUSINESS_ID);

    expect(winner.kind).toBe('new');
    expect(loser.kind).toBe('resume');
    if (winner.kind !== 'new' || loser.kind !== 'resume') throw new Error('unexpected kinds');
    expect(loser.attemptId).toBe(winner.attemptId);
  });
});

describe('recordCheckoutSession', () => {
  it('returns a typed success result when the write succeeds', async () => {
    const { service } = fakeCheckoutAttemptsClient();
    const claim = await claimCheckoutAttempt(service, fakeStripe({}).stripe, BUSINESS_ID);
    if (claim.kind !== 'new') throw new Error('expected new');

    const result = await recordCheckoutSession(service, claim.attemptId, 'cs_ok');

    expect(result).toEqual({ ok: true });
  });

  it('returns a typed failure result instead of throwing or silently succeeding when the write fails', async () => {
    const failingFrom = vi.fn().mockReturnValue({
      update: () => ({
        eq: () => Promise.resolve({ error: { code: '53300', message: 'too many connections' } })
      })
    });
    const service = { from: failingFrom } as unknown as SupabaseClient;

    const result = await recordCheckoutSession(service, 'attempt-1', 'cs_ok');

    expect(result).toEqual({ ok: false, reason: '53300' });
  });
});
