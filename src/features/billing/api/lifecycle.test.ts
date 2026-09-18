import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Paddle } from '@paddle/paddle-node-sdk';

/**
 * One integrated, mocked state-machine test that drives the REAL
 * `startCheckout()` (service.ts), the REAL `claimCheckoutAttempt()`/
 * `recordTransactionId()` (checkout-attempts.ts), the REAL
 * `syncSubscriptionFromPaddle()` (paddle/sync.ts), and the REAL webhook
 * `POST()` handler (paddle/webhook/route.ts) together — only the outer
 * boundaries (Supabase, Paddle, and this feature's own
 * `verifyActiveBusiness()` authorization check) are mocked. Every other
 * test file in src/features/billing/ and src/lib/paddle/ covers one
 * module's behavior in isolation; this file's job is to prove the full
 * lifecycle those modules describe actually composes correctly end to
 * end.
 */

const verifyActiveBusiness = vi.fn();
vi.mock('./authorize', () => ({
  verifyActiveBusiness: (...args: unknown[]) => verifyActiveBusiness(...args)
}));

const getPaddleClient = vi.fn();
const getPaddlePriceId = vi.fn();
const getPaddleEnvironment = vi.fn();
const getPaddleWebhookSecret = vi.fn();
vi.mock('@/lib/paddle/client', () => ({
  getPaddleClient: (...args: unknown[]) => getPaddleClient(...args),
  getPaddlePriceId: (...args: unknown[]) => getPaddlePriceId(...args),
  getPaddleEnvironment: (...args: unknown[]) => getPaddleEnvironment(...args),
  getPaddleWebhookSecret: (...args: unknown[]) => getPaddleWebhookSecret(...args)
}));

const createSupabaseServiceRoleClient = vi.fn();
vi.mock('@/lib/supabase/service-role', () => ({
  createSupabaseServiceRoleClient: (...args: unknown[]) => createSupabaseServiceRoleClient(...args)
}));

const { startCheckout } = await import('./service');
const { POST } = await import('@/app/api/paddle/webhook/route');

type SubRow = {
  business_id: string;
  paddle_customer_id: string | null;
  paddle_subscription_id: string | null;
  paddle_transaction_id: string | null;
  paddle_subscription_created_at: string | null;
  paddle_event_occurred_at: string | null;
  billing_generation: number | null;
  status: string;
  trial_used_at: string | null;
};

type AttemptRow = {
  id: string;
  business_id: string;
  generation: number;
  status: string;
  paddle_transaction_id: string | null;
};

/**
 * One shared fake "database" backing all three tables this feature
 * touches, plus a faithful re-implementation of the real
 * `sync_business_subscription` Postgres function (see the migration and
 * src/lib/paddle/sync.test.ts's own copy of this same fidelity note) as
 * the `.rpc()` mock.
 */
function createFakeDb() {
  const subscriptions = new Map<string, SubRow>();
  const attempts: AttemptRow[] = [];
  const webhookEventIds = new Set<string>();
  let nextGeneration = 1;

  function attemptsTable() {
    function query(op: 'insert' | 'update' | 'select', payload?: Record<string, unknown>) {
      const filters: Array<(row: AttemptRow) => boolean> = [];

      async function execute() {
        if (op === 'insert') {
          const businessId = payload!.business_id as string;
          const alreadyPending = attempts.some(
            (row) => row.business_id === businessId && row.status === 'pending'
          );
          if (alreadyPending) {
            return { data: null, error: { code: '23505', message: 'duplicate pending attempt' } };
          }
          const generation = nextGeneration++;
          attempts.push({
            id: payload!.id as string,
            business_id: businessId,
            generation,
            status: (payload!.status as string) ?? 'pending',
            paddle_transaction_id: null
          });
          return { data: { generation }, error: null };
        }

        if (op === 'update') {
          for (const row of attempts) {
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
              return (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) =>
                execute().then(resolve, reject);
            }
            if (prop === 'eq') {
              return (column: string, value: unknown) => {
                filters.push(
                  (row) => (row as unknown as Record<string, unknown>)[column] === value
                );
                return proxy;
              };
            }
            if (prop === 'maybeSingle' || prop === 'single') {
              return async () => {
                if (op === 'insert') return execute();
                const match = attempts.find((row) => filters.every((f) => f(row))) ?? null;
                return { data: match, error: null };
              };
            }
            return () => proxy;
          }
        }
      );

      return proxy;
    }

    return {
      insert: (payload: Record<string, unknown>) => query('insert', payload),
      update: (payload: Record<string, unknown>) => query('update', payload),
      select: () => query('select')
    };
  }

  function subscriptionsTable() {
    function query() {
      const filters: Array<(row: SubRow) => boolean> = [];
      const proxy: unknown = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === 'eq') {
              return (column: string, value: unknown) => {
                filters.push(
                  (row) => (row as unknown as Record<string, unknown>)[column] === value
                );
                return proxy;
              };
            }
            if (prop === 'maybeSingle') {
              return async () => {
                const match =
                  [...subscriptions.values()].find((row) => filters.every((f) => f(row))) ?? null;
                return { data: match, error: null };
              };
            }
            return () => proxy;
          }
        }
      );
      return proxy;
    }

    return { select: () => query() };
  }

  function webhookEventsTable() {
    function query(op: 'select' | 'insert', payload?: Record<string, unknown>) {
      let eqValue: string | null = null;
      const proxy: unknown = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === 'then') {
              return (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) =>
                execute().then(resolve, reject);
            }
            if (prop === 'eq') {
              return (_column: string, value: string) => {
                eqValue = value;
                return proxy;
              };
            }
            if (prop === 'maybeSingle') {
              return async () => {
                if (eqValue && webhookEventIds.has(eqValue)) {
                  return { data: { paddle_event_id: eqValue }, error: null };
                }
                return { data: null, error: null };
              };
            }
            return () => proxy;
          }
        }
      );

      async function execute() {
        if (op === 'insert') {
          const id = payload!.paddle_event_id as string;
          if (webhookEventIds.has(id)) {
            return { error: { code: '23505', message: 'duplicate event' } };
          }
          webhookEventIds.add(id);
          return { error: null };
        }
        return { data: null, error: null };
      }

      return proxy;
    }

    return {
      select: () => query('select'),
      insert: (payload: Record<string, unknown>) => query('insert', payload)
    };
  }

  const from = vi.fn((table: string) => {
    if (table === 'billing_checkout_attempts') return attemptsTable();
    if (table === 'business_subscriptions') return subscriptionsTable();
    if (table === 'paddle_webhook_events') return webhookEventsTable();
    throw new Error(`unexpected table: ${table}`);
  });

  const rpc = vi.fn(async (fnName: string, params: Record<string, unknown>) => {
    if (fnName !== 'sync_business_subscription') return { error: { message: 'unexpected rpc' } };

    const businessId = params.p_business_id as string;
    const existing = subscriptions.get(businessId) ?? null;
    const incomingSubscriptionId = params.p_paddle_subscription_id as string;
    const incomingOccurredAt = params.p_paddle_event_occurred_at as string | null;
    const incomingGeneration = params.p_billing_generation as number | null;
    const incomingCreatedAt = params.p_paddle_subscription_created_at as string | null;
    const incomingTrialStart = params.p_trial_start as string | null;

    if (existing && existing.trial_used_at === null && incomingTrialStart !== null) {
      existing.trial_used_at = new Date().toISOString();
    }

    const shouldApply =
      !existing ||
      existing.paddle_subscription_id === null ||
      (existing.paddle_subscription_id === incomingSubscriptionId &&
        (existing.paddle_event_occurred_at === null ||
          incomingOccurredAt === null ||
          incomingOccurredAt >= existing.paddle_event_occurred_at)) ||
      (incomingGeneration !== null &&
        (existing.billing_generation === null ||
          incomingGeneration > existing.billing_generation)) ||
      (incomingGeneration === null &&
        existing.billing_generation === null &&
        (existing.paddle_subscription_created_at === null ||
          incomingCreatedAt === null ||
          incomingCreatedAt >= existing.paddle_subscription_created_at));

    if (!shouldApply) return { error: null };

    subscriptions.set(businessId, {
      business_id: businessId,
      paddle_customer_id: params.p_paddle_customer_id as string,
      paddle_subscription_id: incomingSubscriptionId,
      paddle_transaction_id:
        (params.p_paddle_transaction_id as string | null) ??
        existing?.paddle_transaction_id ??
        null,
      paddle_subscription_created_at: incomingCreatedAt,
      paddle_event_occurred_at: incomingOccurredAt,
      billing_generation: incomingGeneration,
      status: params.p_status as string,
      trial_used_at:
        existing?.trial_used_at ?? (incomingTrialStart !== null ? new Date().toISOString() : null)
    });
    return { error: null };
  });

  return { from, rpc, subscriptions, attempts };
}

/** A fake Paddle backing transactions, subscriptions, customers, and webhook signature verification. */
function createFakePaddle() {
  const transactionsById = new Map<string, Record<string, unknown>>();
  const subscriptionsById = new Map<string, Record<string, unknown>>();
  let transactionCounter = 1;
  let customerCounter = 1;

  const create = vi.fn(async (params: Record<string, unknown>) => {
    const id = `txn_${transactionCounter++}`;
    const customerId = params.customerId as string;
    const transaction = {
      id,
      status: 'ready',
      customerId,
      subscriptionId: null as string | null,
      customData: params.customData
    };
    transactionsById.set(id, transaction);
    return transaction;
  });

  const getTransaction = vi.fn(async (id: string) => {
    const transaction = transactionsById.get(id);
    if (!transaction) throw new Error('no such transaction');
    return transaction;
  });

  const getSubscription = vi.fn(async (id: string) => {
    const subscription = subscriptionsById.get(id);
    if (!subscription) throw new Error('no such subscription');
    return subscription;
  });

  function completeTransaction(
    transactionId: string,
    opts: { subscriptionId: string; created: string; status?: string; trialStart?: string | null }
  ) {
    const transaction = transactionsById.get(transactionId)!;
    transaction.status = 'completed';
    transaction.subscriptionId = opts.subscriptionId;
    const trialStart = opts.trialStart ?? null;
    subscriptionsById.set(opts.subscriptionId, {
      id: opts.subscriptionId,
      customerId: transaction.customerId,
      status: opts.status ?? (trialStart ? 'trialing' : 'active'),
      createdAt: opts.created,
      canceledAt: null,
      customData: transaction.customData,
      currentBillingPeriod: { startsAt: opts.created, endsAt: '2026-12-31T00:00:00.000Z' },
      scheduledChange: null,
      items: [
        {
          price: { id: 'pri_test' },
          trialDates: trialStart
            ? { startsAt: trialStart, endsAt: '2026-06-01T00:00:00.000Z' }
            : null
        }
      ]
    });
    return transaction;
  }

  function updateSubscription(id: string, patch: Record<string, unknown>) {
    Object.assign(subscriptionsById.get(id)!, patch);
  }

  const unmarshal = vi.fn(async (rawBody: string) => JSON.parse(rawBody));

  const customersList = vi.fn(() => ({
    async *[Symbol.asyncIterator]() {}
  }));
  const customersCreate = vi.fn(async () => ({ id: `ctm_${customerCounter++}` }));

  const paddle = {
    transactions: { create, get: getTransaction },
    subscriptions: { get: getSubscription },
    customers: { list: customersList, create: customersCreate },
    webhooks: { unmarshal }
  } as unknown as Paddle;

  return {
    paddle,
    completeTransaction,
    updateSubscription,
    transactionsById,
    subscriptionsById
  };
}

function webhookRequest(event: Record<string, unknown>): Request {
  return new Request('https://platform.example/api/paddle/webhook', {
    method: 'POST',
    headers: { 'paddle-signature': 'ts=1;h1=sig' },
    body: JSON.stringify(event)
  });
}

describe('billing lifecycle — integrated state machine', () => {
  it('walks Checkout race → retry (no Paddle idempotency key) → completion → already_subscribed → cancel/resubscribe → stale-webhook rejection, with trial history preserved', async () => {
    const db = createFakeDb();
    const paddle = createFakePaddle();

    createSupabaseServiceRoleClient.mockReturnValue({
      from: db.from,
      rpc: db.rpc
    } as unknown as SupabaseClient);
    getPaddleClient.mockReturnValue(paddle.paddle);
    getPaddlePriceId.mockReturnValue('pri_test');
    getPaddleEnvironment.mockReturnValue('sandbox');
    getPaddleWebhookSecret.mockReturnValue('ntfset_test');
    verifyActiveBusiness.mockImplementation(async (businessId: string) => ({
      ok: true,
      ctx: {
        supabase: {} as unknown as SupabaseClient,
        user: { id: 'user-1', email: 'owner@example.com' } as unknown as User,
        businessId
      }
    }));

    const BIZ = 'biz-lifecycle';

    // -----------------------------------------------------------------
    // Step 1 — a race: two calls "simultaneously." Since Paddle has no
    // idempotency key, the loser must retry — never resume by creating
    // its own transaction.
    // -----------------------------------------------------------------
    const [first, second] = await Promise.all([startCheckout(BIZ), startCheckout(BIZ)]);
    const results = [first, second];
    const oks = results.filter((r) => r.status === 'ok');
    const retries = results.filter((r) => r.status === 'error');
    expect(oks).toHaveLength(1);
    expect(retries).toHaveLength(1);
    expect(db.attempts.filter((a) => a.business_id === BIZ && a.status === 'pending')).toHaveLength(
      1
    );
    expect(paddle.transactionsById.size).toBe(1);

    // -----------------------------------------------------------------
    // Step 2 — a retried call now succeeds by reusing the same,
    // still-open transaction — never creating a second one.
    // -----------------------------------------------------------------
    const retried = await startCheckout(BIZ);
    expect(retried.status).toBe('ok');
    if (retried.status !== 'ok') throw new Error('expected ok');
    const firstTransactionId = [...paddle.transactionsById.keys()][0]!;
    expect(retried.transactionId).toBe(firstTransactionId);
    expect(paddle.transactionsById.size).toBe(1); // still only one transaction ever created

    // -----------------------------------------------------------------
    // Step 3 — the transaction completes; the webhook synchronizes the
    // subscription and marks the attempt completed.
    // -----------------------------------------------------------------
    const FIRST_CREATED = '2026-01-01T00:00:00.000Z';
    paddle.completeTransaction(firstTransactionId, {
      subscriptionId: 'sub_first',
      created: FIRST_CREATED,
      trialStart: FIRST_CREATED
    });

    const completedResponse = await POST(
      webhookRequest({
        eventId: 'evt_txn_completed_1',
        eventType: 'transaction.completed',
        occurredAt: FIRST_CREATED,
        data: { id: firstTransactionId, subscriptionId: 'sub_first' }
      })
    );
    expect(completedResponse.status).toBe(200);

    const rowAfterFirst = db.subscriptions.get(BIZ)!;
    expect(rowAfterFirst.status).toBe('trialing');
    expect(rowAfterFirst.paddle_subscription_id).toBe('sub_first');
    expect(rowAfterFirst.trial_used_at).not.toBeNull();

    const attemptAfterFirst = db.attempts.find((a) => a.business_id === BIZ)!;
    expect(attemptAfterFirst.status).toBe('completed');

    // -----------------------------------------------------------------
    // Step 4 — another Checkout request now returns already_subscribed.
    // -----------------------------------------------------------------
    const alreadySubscribed = await startCheckout(BIZ);
    expect(alreadySubscribed).toEqual({ status: 'already_subscribed' });

    // -----------------------------------------------------------------
    // Step 5 — cancel via webhook; a fresh Checkout is now allowed and
    // creates a NEW, higher-generation attempt/transaction.
    // -----------------------------------------------------------------
    paddle.updateSubscription('sub_first', {
      status: 'canceled',
      canceledAt: '2026-01-02T00:00:00.000Z'
    });
    const cancelResponse = await POST(
      webhookRequest({
        eventId: 'evt_sub_first_canceled',
        eventType: 'subscription.canceled',
        occurredAt: '2026-01-02T00:00:00.000Z',
        data: { ...paddle.subscriptionsById.get('sub_first') }
      })
    );
    expect(cancelResponse.status).toBe(200);
    expect(db.subscriptions.get(BIZ)!.status).toBe('canceled');

    const resubscribed = await startCheckout(BIZ);
    expect(resubscribed.status).toBe('ok');
    if (resubscribed.status !== 'ok') throw new Error('expected ok');
    expect(resubscribed.transactionId).not.toBe(firstTransactionId);

    const SECOND_CREATED = '2026-02-01T00:00:00.000Z';
    paddle.completeTransaction(resubscribed.transactionId, {
      subscriptionId: 'sub_second',
      created: SECOND_CREATED,
      status: 'active',
      trialStart: null
    });
    const secondCompletedResponse = await POST(
      webhookRequest({
        eventId: 'evt_txn_completed_2',
        eventType: 'transaction.completed',
        occurredAt: SECOND_CREATED,
        data: { id: resubscribed.transactionId, subscriptionId: 'sub_second' }
      })
    );
    expect(secondCompletedResponse.status).toBe(200);
    expect(db.subscriptions.get(BIZ)!.paddle_subscription_id).toBe('sub_second');
    expect(db.subscriptions.get(BIZ)!.status).toBe('active');

    // -----------------------------------------------------------------
    // Step 6 — a delayed, out-of-order webhook for the OLD, superseded
    // subscription arrives late. Safe no-op: the newer subscription is
    // untouched, and trial usage stays permanently recorded.
    // -----------------------------------------------------------------
    const staleResponse = await POST(
      webhookRequest({
        eventId: 'evt_sub_first_stale_update',
        eventType: 'subscription.updated',
        occurredAt: '2026-01-01T12:00:00.000Z',
        data: { ...paddle.subscriptionsById.get('sub_first') }
      })
    );
    expect(staleResponse.status).toBe(200);

    const finalRow = db.subscriptions.get(BIZ)!;
    expect(finalRow.paddle_subscription_id).toBe('sub_second');
    expect(finalRow.status).toBe('active');
    expect(finalRow.trial_used_at).not.toBeNull();
  });
});
