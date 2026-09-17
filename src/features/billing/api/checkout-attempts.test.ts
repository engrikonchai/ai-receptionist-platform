import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Paddle } from '@paddle/paddle-node-sdk';
import { claimCheckoutAttempt, recordTransactionId } from './checkout-attempts';

const syncSubscriptionFromPaddle = vi.fn();
vi.mock('@/lib/paddle/sync', () => ({
  syncSubscriptionFromPaddle: (...args: unknown[]) => syncSubscriptionFromPaddle(...args)
}));

/**
 * A stateful, in-memory stand-in for the `billing_checkout_attempts`
 * table that actually enforces the same constraint the real unique
 * partial index (`billing_checkout_attempts_one_pending_per_business`)
 * enforces in Postgres: at most one `status = 'pending'` row per
 * business — and assigns a strictly monotonic `generation` on insert,
 * mirroring the real `generated always as identity` column.
 */
function fakeCheckoutAttemptsClient() {
  type Row = {
    id: string;
    business_id: string;
    generation: number;
    status: string;
    paddle_transaction_id: string | null;
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
          paddle_transaction_id: null
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

function fakePaddle(
  transactions: Record<string, { status: string; subscriptionId?: string | null }>
) {
  const get = vi.fn(async (id: string) => {
    const transaction = transactions[id];
    if (!transaction) throw new Error('no such transaction');
    return { id, subscriptionId: null, ...transaction };
  });
  const subscriptionsGet = vi.fn(async (id: string) => ({ id }));
  return {
    paddle: {
      transactions: { get },
      subscriptions: { get: subscriptionsGet }
    } as unknown as Paddle,
    get,
    subscriptionsGet
  };
}

const BUSINESS_ID = 'biz-1';

beforeEach(() => {
  syncSubscriptionFromPaddle.mockReset();
});

describe('claimCheckoutAttempt — new attempts', () => {
  it('assigns a monotonic generation to a fresh claim', async () => {
    const { service } = fakeCheckoutAttemptsClient();
    const { paddle } = fakePaddle({});

    const claim = await claimCheckoutAttempt(service, paddle, BUSINESS_ID);

    expect(claim).toEqual({ kind: 'new', attemptId: expect.any(String), generation: 1 });
  });

  it('never lets a business_id it does not own affect a different business’s pending attempt', async () => {
    const { service, rows } = fakeCheckoutAttemptsClient();
    const { paddle } = fakePaddle({});

    const forBusinessA = await claimCheckoutAttempt(service, paddle, 'biz-a');
    const forBusinessB = await claimCheckoutAttempt(service, paddle, 'biz-b');

    expect(forBusinessA.kind).toBe('new');
    expect(forBusinessB.kind).toBe('new');
    expect(rows.filter((r) => r.status === 'pending')).toHaveLength(2);
  });
});

describe('claimCheckoutAttempt — no safe resume without a Paddle idempotency key (concurrency)', () => {
  it('two simultaneous claims for the same business converge on exactly one winner — the loser must retry, never create a competing transaction', async () => {
    const { service, rows } = fakeCheckoutAttemptsClient();
    const { paddle } = fakePaddle({});

    const first = await claimCheckoutAttempt(service, paddle, BUSINESS_ID);
    const second = await claimCheckoutAttempt(service, paddle, BUSINESS_ID);

    expect(first.kind).toBe('new');
    expect(second).toEqual({ kind: 'retry' });
    expect(rows.filter((r) => r.status === 'pending')).toHaveLength(1);
  });

  it('a retried call reuses the winner’s recorded, still-open transaction instead of creating a second one', async () => {
    const { service } = fakeCheckoutAttemptsClient();
    const { paddle } = fakePaddle({ txn_1: { status: 'ready' } });

    const winner = await claimCheckoutAttempt(service, paddle, BUSINESS_ID);
    if (winner.kind !== 'new') throw new Error('expected the first claim to win');
    await recordTransactionId(service, winner.attemptId, 'txn_1');

    const retried = await claimCheckoutAttempt(service, paddle, BUSINESS_ID);

    expect(retried).toEqual({ kind: 'reuse', transactionId: 'txn_1' });
  });

  it('reuses a draft transaction the same way as a ready one', async () => {
    const { service } = fakeCheckoutAttemptsClient();
    const { paddle } = fakePaddle({ txn_1: { status: 'draft' } });

    const winner = await claimCheckoutAttempt(service, paddle, BUSINESS_ID);
    if (winner.kind !== 'new') throw new Error('expected the first claim to win');
    await recordTransactionId(service, winner.attemptId, 'txn_1');

    const retried = await claimCheckoutAttempt(service, paddle, BUSINESS_ID);

    expect(retried).toEqual({ kind: 'reuse', transactionId: 'txn_1' });
  });
});

describe('claimCheckoutAttempt — a succeeded transaction is never replaced', () => {
  it('reports already_subscribed and synchronizes the subscription when the recorded transaction succeeded', async () => {
    const { service, rows } = fakeCheckoutAttemptsClient();
    const { paddle } = fakePaddle({ txn_1: { status: 'completed', subscriptionId: 'sub_1' } });
    syncSubscriptionFromPaddle.mockResolvedValue({ ok: true });

    const winner = await claimCheckoutAttempt(service, paddle, BUSINESS_ID);
    if (winner.kind !== 'new') throw new Error('expected the first claim to win');
    await recordTransactionId(service, winner.attemptId, 'txn_1');

    const claim = await claimCheckoutAttempt(service, paddle, BUSINESS_ID);

    expect(claim).toEqual({ kind: 'already_subscribed' });
    expect(syncSubscriptionFromPaddle).toHaveBeenCalledWith(service, { id: 'sub_1' }, null);
    expect(rows.find((r) => r.id === winner.attemptId)?.status).toBe('completed');
  });

  it('treats "paid" and "billed" the same as "completed"', async () => {
    for (const status of ['paid', 'billed']) {
      const { service } = fakeCheckoutAttemptsClient();
      const { paddle } = fakePaddle({ txn_1: { status, subscriptionId: 'sub_1' } });
      syncSubscriptionFromPaddle.mockResolvedValue({ ok: true });

      const winner = await claimCheckoutAttempt(service, paddle, BUSINESS_ID);
      if (winner.kind !== 'new') throw new Error('expected the first claim to win');
      await recordTransactionId(service, winner.attemptId, 'txn_1');

      const claim = await claimCheckoutAttempt(service, paddle, BUSINESS_ID);
      expect(claim).toEqual({ kind: 'already_subscribed' });
    }
  });

  it('reports processing, never creating a new Checkout, when the webhook/DB subscription row is delayed', async () => {
    const { service, rows } = fakeCheckoutAttemptsClient();
    const { paddle } = fakePaddle({ txn_1: { status: 'completed', subscriptionId: 'sub_1' } });
    syncSubscriptionFromPaddle.mockResolvedValue({ ok: false, reason: 'db_error' });

    const winner = await claimCheckoutAttempt(service, paddle, BUSINESS_ID);
    if (winner.kind !== 'new') throw new Error('expected the first claim to win');
    await recordTransactionId(service, winner.attemptId, 'txn_1');

    const claim = await claimCheckoutAttempt(service, paddle, BUSINESS_ID);

    expect(claim).toEqual({ kind: 'processing' });
    expect(rows.filter((r) => r.status === 'pending')).toHaveLength(0);
  });

  it('reports processing when a succeeded transaction has no subscription id to synchronize', async () => {
    const { service } = fakeCheckoutAttemptsClient();
    const { paddle } = fakePaddle({ txn_1: { status: 'completed', subscriptionId: null } });

    const winner = await claimCheckoutAttempt(service, paddle, BUSINESS_ID);
    if (winner.kind !== 'new') throw new Error('expected the first claim to win');
    await recordTransactionId(service, winner.attemptId, 'txn_1');

    const claim = await claimCheckoutAttempt(service, paddle, BUSINESS_ID);

    expect(claim).toEqual({ kind: 'processing' });
    expect(syncSubscriptionFromPaddle).not.toHaveBeenCalled();
  });

  it('never fabricates an event-occurred-at timestamp for this proactive, non-webhook sync', async () => {
    const { service } = fakeCheckoutAttemptsClient();
    const { paddle } = fakePaddle({ txn_1: { status: 'completed', subscriptionId: 'sub_1' } });
    syncSubscriptionFromPaddle.mockResolvedValue({ ok: true });

    const winner = await claimCheckoutAttempt(service, paddle, BUSINESS_ID);
    if (winner.kind !== 'new') throw new Error('expected the first claim to win');
    await recordTransactionId(service, winner.attemptId, 'txn_1');

    await claimCheckoutAttempt(service, paddle, BUSINESS_ID);

    expect(syncSubscriptionFromPaddle).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      null
    );
  });
});

describe('claimCheckoutAttempt — a dead transaction allows a fresh attempt', () => {
  it('marks the attempt expired and claims a new one only once Paddle itself reports the transaction canceled', async () => {
    const { service, rows } = fakeCheckoutAttemptsClient();
    const { paddle } = fakePaddle({ txn_1: { status: 'canceled' } });

    const winner = await claimCheckoutAttempt(service, paddle, BUSINESS_ID);
    if (winner.kind !== 'new') throw new Error('expected the first claim to win');
    await recordTransactionId(service, winner.attemptId, 'txn_1');

    const claim = await claimCheckoutAttempt(service, paddle, BUSINESS_ID);

    expect(claim.kind).toBe('new');
    expect(rows.find((r) => r.id === winner.attemptId)?.status).toBe('expired');
    expect(rows.filter((r) => r.status === 'pending')).toHaveLength(1);
  });

  it('never allows a new attempt while the old transaction is still open (ready/draft)', async () => {
    const { service, rows } = fakeCheckoutAttemptsClient();
    const { paddle } = fakePaddle({ txn_1: { status: 'ready' } });

    const winner = await claimCheckoutAttempt(service, paddle, BUSINESS_ID);
    if (winner.kind !== 'new') throw new Error('expected the first claim to win');
    await recordTransactionId(service, winner.attemptId, 'txn_1');

    const claim = await claimCheckoutAttempt(service, paddle, BUSINESS_ID);

    expect(claim.kind).not.toBe('new');
    expect(rows.filter((r) => r.status === 'pending')).toHaveLength(1);
  });
});

describe('recordTransactionId', () => {
  it('returns a typed success result when the write succeeds', async () => {
    const { service } = fakeCheckoutAttemptsClient();
    const { paddle } = fakePaddle({});
    const claim = await claimCheckoutAttempt(service, paddle, BUSINESS_ID);
    if (claim.kind !== 'new') throw new Error('expected new');

    const result = await recordTransactionId(service, claim.attemptId, 'txn_ok');

    expect(result).toEqual({ ok: true });
  });

  it('returns a typed failure result instead of throwing or silently succeeding when the write fails', async () => {
    const failingFrom = vi.fn().mockReturnValue({
      update: () => ({
        eq: () => Promise.resolve({ error: { code: '53300', message: 'too many connections' } })
      })
    });
    const service = { from: failingFrom } as unknown as SupabaseClient;

    const result = await recordTransactionId(service, 'attempt-1', 'txn_ok');

    expect(result).toEqual({ ok: false, reason: '53300' });
  });
});
