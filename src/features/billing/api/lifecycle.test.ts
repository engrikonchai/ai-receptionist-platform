import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type Stripe from 'stripe';

/**
 * One integrated, mocked state-machine test that drives the REAL
 * `startCheckout()` (service.ts), the REAL `claimCheckoutAttempt()`/
 * `recordCheckoutSession()` (checkout-attempts.ts), the REAL
 * `syncSubscriptionFromStripe()` (sync.ts), and the REAL webhook
 * `POST()` handler (route.ts) together — only the outer boundaries
 * (Supabase, Stripe, and this feature's own `verifyActiveBusiness()`
 * authorization check) are mocked. Every other test file in
 * src/features/billing/ and src/lib/stripe/ covers one module's
 * behavior in isolation with a narrow, purpose-built mock; this file's
 * job is to prove the full lifecycle those modules describe actually
 * composes correctly end to end.
 */

const verifyActiveBusiness = vi.fn();
vi.mock('./authorize', () => ({
  verifyActiveBusiness: (...args: unknown[]) => verifyActiveBusiness(...args)
}));

const getStripeClient = vi.fn();
const getStripePriceId = vi.fn();
const isStripeConfigured = vi.fn();
const getStripeWebhookSecret = vi.fn();
vi.mock('@/lib/stripe/client', () => ({
  getStripeClient: (...args: unknown[]) => getStripeClient(...args),
  getStripePriceId: (...args: unknown[]) => getStripePriceId(...args),
  isStripeConfigured: (...args: unknown[]) => isStripeConfigured(...args),
  getStripeWebhookSecret: (...args: unknown[]) => getStripeWebhookSecret(...args)
}));

const getSiteUrl = vi.fn();
vi.mock('@/lib/site-url', () => ({
  getSiteUrl: (...args: unknown[]) => getSiteUrl(...args)
}));

const createSupabaseServiceRoleClient = vi.fn();
vi.mock('@/lib/supabase/service-role', () => ({
  createSupabaseServiceRoleClient: (...args: unknown[]) => createSupabaseServiceRoleClient(...args)
}));

const { startCheckout } = await import('./service');
const { POST } = await import('@/app/api/stripe/webhook/route');

type SubRow = {
  business_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_created_at: string | null;
  billing_generation: number | null;
  status: string;
  trial_start: string | null;
  trial_end: string | null;
  trial_used_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
};

type AttemptRow = {
  id: string;
  business_id: string;
  generation: number;
  status: string;
  stripe_checkout_session_id: string | null;
  expires_at: string;
};

/**
 * One shared fake "database" backing all three tables this feature
 * touches, plus a faithful re-implementation of the real
 * `sync_business_subscription` Postgres function (see the migration and
 * sync.test.ts's own copy of this same fidelity note) as the `.rpc()`
 * mock — the same generation-based ordering and independent trial
 * usage the real SQL implements.
 */
function createFakeDb() {
  const subscriptions = new Map<string, SubRow>();
  const attempts: AttemptRow[] = [];
  const webhookEventIds = new Set<string>();
  let nextGeneration = 1;
  let failNextAttemptUpdate = false;

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
            stripe_checkout_session_id: null,
            expires_at: payload!.expires_at as string
          });
          return { data: { generation }, error: null };
        }

        if (op === 'update') {
          if (failNextAttemptUpdate) {
            failNextAttemptUpdate = false;
            return { error: { code: '53300', message: 'simulated transient DB failure' } };
          }
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
    // Only ever SELECTed by application code (see service.ts) — every
    // write happens exclusively through the RPC below.
    function query() {
      const filters: Array<(row: SubRow) => boolean> = [];
      const proxy: unknown = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === 'then') {
              return (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) =>
                Promise.resolve({ data: null, error: null }).then(resolve, reject);
            }
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
                  return { data: { stripe_event_id: eqValue }, error: null };
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
          const id = payload!.stripe_event_id as string;
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
    if (table === 'stripe_webhook_events') return webhookEventsTable();
    throw new Error(`unexpected table: ${table}`);
  });

  const rpc = vi.fn(async (fnName: string, params: Record<string, unknown>) => {
    if (fnName !== 'sync_business_subscription') return { error: { message: 'unexpected rpc' } };

    const businessId = params.p_business_id as string;
    const existing = subscriptions.get(businessId) ?? null;
    const incomingGeneration = params.p_billing_generation as number | null;
    const incomingCreatedAt = params.p_stripe_subscription_created_at as string | null;
    const incomingSubscriptionId = params.p_stripe_subscription_id as string;
    const incomingTrialStart = params.p_trial_start as string | null;

    // Statement 1 (mirrors the real function): trial usage, independent
    // of the ordering guard below.
    if (existing && existing.trial_used_at === null && incomingTrialStart !== null) {
      existing.trial_used_at = new Date().toISOString();
    }

    // Statement 2: the generation-guarded upsert.
    const shouldApply =
      !existing ||
      existing.stripe_subscription_id === null ||
      existing.stripe_subscription_id === incomingSubscriptionId ||
      (incomingGeneration !== null &&
        (existing.billing_generation === null ||
          incomingGeneration > existing.billing_generation)) ||
      (incomingGeneration === null &&
        existing.billing_generation === null &&
        (existing.stripe_subscription_created_at === null ||
          incomingCreatedAt === null ||
          incomingCreatedAt >= existing.stripe_subscription_created_at));

    if (!shouldApply) return { error: null };

    subscriptions.set(businessId, {
      business_id: businessId,
      stripe_customer_id: params.p_stripe_customer_id as string,
      stripe_subscription_id: incomingSubscriptionId,
      stripe_subscription_created_at: incomingCreatedAt,
      billing_generation: incomingGeneration,
      status: params.p_status as string,
      trial_start: params.p_trial_start as string | null,
      trial_end: params.p_trial_end as string | null,
      trial_used_at:
        existing?.trial_used_at ?? (incomingTrialStart !== null ? new Date().toISOString() : null),
      current_period_start: params.p_current_period_start as string | null,
      current_period_end: params.p_current_period_end as string | null,
      cancel_at_period_end: params.p_cancel_at_period_end as boolean,
      canceled_at: params.p_canceled_at as string | null
    });
    return { error: null };
  });

  return {
    from,
    rpc,
    subscriptions,
    attempts,
    failNextAttemptUpdate: () => {
      failNextAttemptUpdate = true;
    }
  };
}

/** A fake Stripe backing Checkout Sessions and Subscriptions, with real-Stripe-like idempotency-key semantics: a repeated `create()` call with the same key returns the SAME session object rather than creating a second one. */
function createFakeStripe() {
  const sessionsById = new Map<string, Record<string, unknown>>();
  const sessionsByIdempotencyKey = new Map<string, Record<string, unknown>>();
  const subscriptionsById = new Map<string, Record<string, unknown>>();
  let sessionCounter = 1;
  let customerCounter = 1;

  const create = vi.fn(
    async (params: Record<string, unknown>, options: { idempotencyKey: string }) => {
      const existing = sessionsByIdempotencyKey.get(options.idempotencyKey);
      if (existing) return existing;

      const id = `cs_${sessionCounter++}`;
      const customer = (params.customer as string | undefined) ?? `cus_${customerCounter++}`;
      const session = {
        id,
        status: 'open',
        url: `https://checkout.stripe.com/${id}`,
        mode: 'subscription',
        subscription: null,
        customer,
        subscription_data: params.subscription_data,
        expires_at: params.expires_at
      };
      sessionsById.set(id, session);
      sessionsByIdempotencyKey.set(options.idempotencyKey, session);
      return session;
    }
  );

  const retrieveSession = vi.fn(async (id: string) => {
    const session = sessionsById.get(id);
    if (!session) throw new Error('no such session');
    return session;
  });

  const retrieveSubscription = vi.fn(async (id: string) => {
    const subscription = subscriptionsById.get(id);
    if (!subscription) throw new Error('no such subscription');
    return subscription;
  });

  function completeSession(
    sessionId: string,
    opts: { subscriptionId: string; created: number; status?: string; trialStart?: number | null }
  ) {
    const session = sessionsById.get(sessionId)!;
    session.status = 'complete';
    session.subscription = opts.subscriptionId;
    const trialStart = opts.trialStart ?? null;
    const subscriptionData = session.subscription_data as { metadata?: Record<string, string> };
    subscriptionsById.set(opts.subscriptionId, {
      id: opts.subscriptionId,
      customer: session.customer,
      status: opts.status ?? (trialStart ? 'trialing' : 'active'),
      created: opts.created,
      trial_start: trialStart,
      trial_end: trialStart ? trialStart + 14 * 86_400 : null,
      cancel_at_period_end: false,
      canceled_at: null,
      metadata: subscriptionData?.metadata ?? {},
      items: {
        data: [
          {
            price: { id: 'price_test' },
            current_period_start: opts.created,
            current_period_end: opts.created + 30 * 86_400
          }
        ]
      }
    });
  }

  function updateSubscription(id: string, patch: Record<string, unknown>) {
    Object.assign(subscriptionsById.get(id)!, patch);
  }

  const stripe = {
    checkout: { sessions: { create, retrieve: retrieveSession } },
    subscriptions: { retrieve: retrieveSubscription },
    webhooks: { constructEventAsync: vi.fn(async (rawBody: string) => JSON.parse(rawBody)) }
  } as unknown as Stripe;

  return { stripe, completeSession, updateSubscription, sessionsById, subscriptionsById };
}

function webhookRequest(event: Record<string, unknown>): Request {
  return new Request('https://platform.example/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': 'sig' },
    body: JSON.stringify(event)
  });
}

describe('billing lifecycle — integrated state machine (item 6)', () => {
  it('walks Checkout race → recovery → completion → already_subscribed → cancel/resubscribe → stale-webhook rejection, with no second trial', async () => {
    const db = createFakeDb();
    const fakeStripe = createFakeStripe();

    createSupabaseServiceRoleClient.mockReturnValue({
      from: db.from,
      rpc: db.rpc
    } as unknown as SupabaseClient);
    getStripeClient.mockReturnValue(fakeStripe.stripe);
    getStripePriceId.mockReturnValue('price_test');
    isStripeConfigured.mockReturnValue(true);
    getStripeWebhookSecret.mockReturnValue('whsec_test');
    getSiteUrl.mockReturnValue('https://app.example.com');
    verifyActiveBusiness.mockImplementation(async (businessId: string) => ({
      ok: true,
      ctx: {
        supabase: {} as unknown as SupabaseClient,
        user: { id: 'user-1' } as unknown as User,
        businessId
      }
    }));

    // -----------------------------------------------------------------
    // Step 1 — two simultaneous Checkout calls for the same business
    // converge on one durable attempt and one Stripe Session.
    // -----------------------------------------------------------------
    const RACING_BIZ = 'biz-racing';
    const [race1, race2] = await Promise.all([
      startCheckout(RACING_BIZ),
      startCheckout(RACING_BIZ)
    ]);
    expect(race1.status).toBe('ok');
    expect(race2.status).toBe('ok');
    if (race1.status !== 'ok' || race2.status !== 'ok') throw new Error('expected ok');
    expect(race1.url).toBe(race2.url);
    expect(
      db.attempts.filter((a) => a.business_id === RACING_BIZ && a.status === 'pending')
    ).toHaveLength(1);
    expect(
      [...fakeStripe.sessionsById.values()].filter(
        (s) =>
          (s.subscription_data as { metadata: { business_id: string } }).metadata.business_id ===
          RACING_BIZ
      )
    ).toHaveLength(1);

    // -----------------------------------------------------------------
    // Step 2 — a Checkout Session is created but recording it durably
    // fails; a retry recovers the EXACT same session via the same
    // idempotency key, never a second one.
    // -----------------------------------------------------------------
    const BIZ = 'biz-lifecycle';
    db.failNextAttemptUpdate();
    const attempt1 = await startCheckout(BIZ);
    expect(attempt1.status).toBe('ok');
    if (attempt1.status !== 'ok') throw new Error('expected ok');

    const attemptRow = db.attempts.find((a) => a.business_id === BIZ)!;
    expect(attemptRow.stripe_checkout_session_id).toBeNull(); // the failed write never landed

    const attempt2 = await startCheckout(BIZ);
    expect(attempt2.status).toBe('ok');
    if (attempt2.status !== 'ok') throw new Error('expected ok');
    expect(attempt2.url).toBe(attempt1.url); // recovered, not a new session
    expect(attemptRow.stripe_checkout_session_id).not.toBeNull(); // now durably recorded

    const bizSessions = [...fakeStripe.sessionsById.values()].filter(
      (s) =>
        (s.subscription_data as { metadata: { business_id: string } }).metadata.business_id === BIZ
    );
    expect(bizSessions).toHaveLength(1); // never a second Stripe Session for this business
    const firstSession = bizSessions[0]!;
    expect(
      (firstSession.subscription_data as { trial_period_days?: number }).trial_period_days
    ).toBe(14); // this business's first-ever Checkout — trial eligible

    // -----------------------------------------------------------------
    // Step 3 — the session completes; the webhook synchronizes the
    // subscription and marks the attempt completed.
    // -----------------------------------------------------------------
    const FIRST_CREATED = 1_800_000_000;
    fakeStripe.completeSession(firstSession.id as string, {
      subscriptionId: 'sub_first',
      created: FIRST_CREATED,
      trialStart: FIRST_CREATED
    });

    const completedResponse = await POST(
      webhookRequest({
        id: 'evt_checkout_completed_1',
        type: 'checkout.session.completed',
        data: { object: { id: firstSession.id, mode: 'subscription', subscription: 'sub_first' } }
      })
    );
    expect(completedResponse.status).toBe(200);

    const rowAfterFirstCheckout = db.subscriptions.get(BIZ)!;
    expect(rowAfterFirstCheckout.status).toBe('trialing');
    expect(rowAfterFirstCheckout.stripe_subscription_id).toBe('sub_first');
    expect(rowAfterFirstCheckout.trial_used_at).not.toBeNull();
    expect(attemptRow.status).toBe('completed');

    // -----------------------------------------------------------------
    // Step 4 — another Checkout request for this business now returns
    // already_subscribed, never a new attempt.
    // -----------------------------------------------------------------
    const alreadySubscribed = await startCheckout(BIZ);
    expect(alreadySubscribed).toEqual({ status: 'already_subscribed' });

    // -----------------------------------------------------------------
    // Step 5 — the subscription is later canceled; a fresh Checkout is
    // now allowed and creates a NEW, higher-generation attempt. Since
    // trial_used_at is already set, no second trial is granted.
    // -----------------------------------------------------------------
    fakeStripe.updateSubscription('sub_first', {
      status: 'canceled',
      canceled_at: FIRST_CREATED + 1_000
    });
    const cancelResponse = await POST(
      webhookRequest({
        id: 'evt_sub_first_deleted',
        type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_first' } }
      })
    );
    expect(cancelResponse.status).toBe(200);
    expect(db.subscriptions.get(BIZ)!.status).toBe('canceled');

    const resubscribed = await startCheckout(BIZ);
    expect(resubscribed.status).toBe('ok');
    if (resubscribed.status !== 'ok') throw new Error('expected ok');

    const newSession = [...fakeStripe.sessionsById.values()].find(
      (s) =>
        s.id !== firstSession.id &&
        (s.subscription_data as { metadata: { business_id: string } }).metadata.business_id === BIZ
    )!;
    expect(
      (newSession.subscription_data as { trial_period_days?: number }).trial_period_days
    ).toBeUndefined(); // no second trial
    expect(newSession.customer).toBe(firstSession.customer); // the same Stripe customer is reused

    const SECOND_CREATED = FIRST_CREATED + 10_000;
    fakeStripe.completeSession(newSession.id as string, {
      subscriptionId: 'sub_second',
      created: SECOND_CREATED,
      status: 'active',
      trialStart: null
    });
    const secondCompletedResponse = await POST(
      webhookRequest({
        id: 'evt_checkout_completed_2',
        type: 'checkout.session.completed',
        data: { object: { id: newSession.id, mode: 'subscription', subscription: 'sub_second' } }
      })
    );
    expect(secondCompletedResponse.status).toBe(200);
    expect(db.subscriptions.get(BIZ)!.stripe_subscription_id).toBe('sub_second');
    expect(db.subscriptions.get(BIZ)!.status).toBe('active');

    // -----------------------------------------------------------------
    // Step 6 — a delayed, out-of-order webhook for the OLD, superseded
    // subscription arrives late. It must be a safe no-op: the newer
    // subscription is untouched, and trial usage stays permanently
    // recorded from the very first subscription.
    // -----------------------------------------------------------------
    const staleResponse = await POST(
      webhookRequest({
        id: 'evt_sub_first_stale_update',
        type: 'customer.subscription.updated',
        data: { object: { id: 'sub_first' } }
      })
    );
    expect(staleResponse.status).toBe(200);

    const finalRow = db.subscriptions.get(BIZ)!;
    expect(finalRow.stripe_subscription_id).toBe('sub_second');
    expect(finalRow.status).toBe('active');
    expect(finalRow.trial_used_at).not.toBeNull();
  });
});
