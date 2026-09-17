import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { syncSubscriptionFromStripe } from './sync';

function mockSupabase(result: { error: { code?: string; message?: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { supabase: { rpc } as unknown as SupabaseClient, rpc };
}

function mockStripe(subscription: Partial<Stripe.Subscription>) {
  const retrieve = vi.fn().mockResolvedValue(subscription);
  return { stripe: { subscriptions: { retrieve } } as unknown as Stripe, retrieve };
}

const BASE_SUBSCRIPTION: Partial<Stripe.Subscription> = {
  id: 'sub_123',
  customer: 'cus_123',
  status: 'trialing',
  metadata: { business_id: 'biz-1', billing_generation: '1' },
  created: 1_699_000_000,
  cancel_at_period_end: false,
  canceled_at: null,
  trial_start: 1_700_000_000,
  trial_end: 1_700_600_000,
  items: {
    object: 'list',
    data: [
      {
        price: { id: 'price_abc' },
        current_period_start: 1_700_000_000,
        current_period_end: 1_702_600_000
      }
    ]
  } as unknown as Stripe.Subscription['items']
};

describe('syncSubscriptionFromStripe', () => {
  it('re-fetches the live subscription from Stripe rather than trusting a caller-supplied snapshot', async () => {
    const { stripe, retrieve } = mockStripe(BASE_SUBSCRIPTION);
    const { supabase } = mockSupabase({ error: null });

    await syncSubscriptionFromStripe(supabase, stripe, 'sub_123');

    expect(retrieve).toHaveBeenCalledWith('sub_123');
  });

  it('synchronizes via the atomic sync_business_subscription RPC, mapping every field from the live subscription', async () => {
    const { stripe } = mockStripe(BASE_SUBSCRIPTION);
    const { supabase, rpc } = mockSupabase({ error: null });

    const result = await syncSubscriptionFromStripe(supabase, stripe, 'sub_123');

    expect(result).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith(
      'sync_business_subscription',
      expect.objectContaining({
        p_business_id: 'biz-1',
        p_stripe_customer_id: 'cus_123',
        p_stripe_subscription_id: 'sub_123',
        p_stripe_subscription_created_at: new Date(1_699_000_000 * 1000).toISOString(),
        p_billing_generation: 1,
        p_stripe_price_id: 'price_abc',
        p_status: 'trialing',
        p_cancel_at_period_end: false,
        p_canceled_at: null,
        p_trial_start: new Date(1_700_000_000 * 1000).toISOString(),
        p_trial_end: new Date(1_700_600_000 * 1000).toISOString(),
        p_current_period_start: new Date(1_700_000_000 * 1000).toISOString(),
        p_current_period_end: new Date(1_702_600_000 * 1000).toISOString()
      })
    );
  });

  it('passes null billing_generation for a subscription whose metadata has none (predates the column, or wasn’t created through startCheckout())', async () => {
    const { stripe } = mockStripe({ ...BASE_SUBSCRIPTION, metadata: { business_id: 'biz-1' } });
    const { supabase, rpc } = mockSupabase({ error: null });

    await syncSubscriptionFromStripe(supabase, stripe, 'sub_123');

    expect(rpc).toHaveBeenCalledWith(
      'sync_business_subscription',
      expect.objectContaining({ p_billing_generation: null })
    );
  });

  it('resolves a fully-expanded customer object to its id, not the whole object', async () => {
    const { stripe } = mockStripe({
      ...BASE_SUBSCRIPTION,
      customer: { id: 'cus_expanded' } as unknown as Stripe.Subscription['customer']
    });
    const { supabase, rpc } = mockSupabase({ error: null });

    await syncSubscriptionFromStripe(supabase, stripe, 'sub_123');

    expect(rpc).toHaveBeenCalledWith(
      'sync_business_subscription',
      expect.objectContaining({ p_stripe_customer_id: 'cus_expanded' })
    );
  });

  it('maps a canceled subscription’s status and canceled_at — the database, not this function, decides whether the write applies', async () => {
    const { stripe } = mockStripe({
      ...BASE_SUBSCRIPTION,
      status: 'canceled',
      canceled_at: 1_703_000_000,
      cancel_at_period_end: false
    });
    const { supabase, rpc } = mockSupabase({ error: null });

    const result = await syncSubscriptionFromStripe(supabase, stripe, 'sub_123');

    expect(result).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith(
      'sync_business_subscription',
      expect.objectContaining({
        p_status: 'canceled',
        p_canceled_at: new Date(1_703_000_000 * 1000).toISOString()
      })
    );
  });

  it('refuses to sync a subscription with no business_id metadata — never guesses which business it belongs to', async () => {
    const { stripe } = mockStripe({
      ...BASE_SUBSCRIPTION,
      metadata: {}
    });
    const { supabase, rpc } = mockSupabase({ error: null });

    const result = await syncSubscriptionFromStripe(supabase, stripe, 'sub_123');

    expect(result).toEqual({ ok: false, reason: 'missing_business_id_metadata' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reports a DB/RPC error instead of silently succeeding', async () => {
    const { stripe } = mockStripe(BASE_SUBSCRIPTION);
    const { supabase } = mockSupabase({ error: { code: '23503', message: 'fk violation' } });

    const result = await syncSubscriptionFromStripe(supabase, stripe, 'sub_123');

    expect(result).toEqual({ ok: false, reason: '23503' });
  });

  it('writes null for trial/period fields when the live subscription has none', async () => {
    const { stripe } = mockStripe({
      ...BASE_SUBSCRIPTION,
      trial_start: null,
      trial_end: null,
      items: {
        object: 'list',
        data: [
          {
            price: { id: 'price_abc' },
            current_period_start: undefined,
            current_period_end: undefined
          }
        ]
      } as unknown as Stripe.Subscription['items']
    });
    const { supabase, rpc } = mockSupabase({ error: null });

    await syncSubscriptionFromStripe(supabase, stripe, 'sub_123');

    expect(rpc).toHaveBeenCalledWith(
      'sync_business_subscription',
      expect.objectContaining({
        p_trial_start: null,
        p_trial_end: null,
        p_current_period_start: null,
        p_current_period_end: null
      })
    );
  });
});

/**
 * A faithful, in-memory re-implementation of the final
 * `sync_business_subscription` Postgres function's own two-statement
 * design (see the migration), used as the `.rpc()` mock here so these
 * tests exercise the actual ordering/idempotency/trial semantics
 * end-to-end — not just "were these arguments passed." There is no live
 * Postgres instance in this environment; the atomic guarantee itself
 * (this all happens inside one function call's transaction, never a JS
 * read-then-write) is verified separately by the migration's own static
 * contract test, which asserts the exact SQL shape.
 *
 * Ordering: `billing_generation` is the PRIMARY comparison whenever the
 * incoming row has one — a strictly monotonic integer with no possible
 * ties. `stripe_subscription_created_at` is only a fallback, used when
 * NEITHER side has a generation.
 *
 * Trial usage: applied unconditionally first (statement 1 in the real
 * function), independent of whatever the ordering guard (statement 2)
 * decides — mirrors the real function's two-statement split.
 */
function fakeSyncRpcTable() {
  type Row = {
    stripe_subscription_id: string | null;
    stripe_subscription_created_at: string | null;
    billing_generation: number | null;
    status: string;
    trial_used_at: string | null;
    [key: string]: unknown;
  };
  const rows = new Map<string, Row>();

  const rpc = vi.fn(async (fnName: string, params: Record<string, unknown>) => {
    if (fnName !== 'sync_business_subscription') return { error: { message: 'unexpected rpc' } };

    const businessId = params.p_business_id as string;
    const existing = rows.get(businessId) ?? null;
    const incomingCreatedAt = params.p_stripe_subscription_created_at as string | null;
    const incomingGeneration = params.p_billing_generation as number | null;
    const incomingSubscriptionId = params.p_stripe_subscription_id as string;
    const incomingTrialStart = params.p_trial_start as string | null;

    // Statement 1 — independent, immutable trial usage. Applies
    // regardless of what the ordering guard below decides.
    if (existing && existing.trial_used_at === null && incomingTrialStart !== null) {
      existing.trial_used_at = 'trial-used';
    }

    // Statement 2 — the guarded subscription-state upsert.
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

    if (!shouldApply) {
      return { error: null }; // successful no-op — mirrors the WHERE guard matching zero rows
    }

    rows.set(businessId, {
      stripe_subscription_id: incomingSubscriptionId,
      stripe_subscription_created_at: incomingCreatedAt,
      billing_generation: incomingGeneration,
      status: params.p_status as string,
      trial_used_at: existing?.trial_used_at ?? (incomingTrialStart !== null ? 'trial-used' : null),
      stripe_customer_id: params.p_stripe_customer_id,
      current_period_end: params.p_current_period_end
    });
    return { error: null };
  });

  return { rpc, rows };
}

function subscriptionFixture(overrides: Partial<Stripe.Subscription>): {
  stripe: Stripe;
} {
  return mockStripe({ ...BASE_SUBSCRIPTION, ...overrides });
}

describe('sync_business_subscription ordering semantics (via the RPC mock)', () => {
  it('lets a newer subscription (higher generation) replace an older one on file', async () => {
    const { rpc, rows } = fakeSyncRpcTable();
    const supabase = { rpc } as unknown as SupabaseClient;

    const older = subscriptionFixture({
      id: 'sub_old',
      created: 1_000_000_000,
      status: 'canceled',
      metadata: { business_id: 'biz-1', billing_generation: '1' }
    });
    await syncSubscriptionFromStripe(supabase, older.stripe, 'sub_old');

    const newer = subscriptionFixture({
      id: 'sub_new',
      created: 2_000_000_000,
      status: 'active',
      metadata: { business_id: 'biz-1', billing_generation: '2' }
    });
    await syncSubscriptionFromStripe(supabase, newer.stripe, 'sub_new');

    expect(rows.get('biz-1')?.stripe_subscription_id).toBe('sub_new');
    expect(rows.get('biz-1')?.status).toBe('active');
  });

  it('refuses to let a delayed webhook from an older subscription (lower generation) overwrite the newer one already on file', async () => {
    const { rpc, rows } = fakeSyncRpcTable();
    const supabase = { rpc } as unknown as SupabaseClient;

    const newer = subscriptionFixture({
      id: 'sub_new',
      created: 2_000_000_000,
      status: 'active',
      metadata: { business_id: 'biz-1', billing_generation: '2' }
    });
    await syncSubscriptionFromStripe(supabase, newer.stripe, 'sub_new');

    const delayedOlder = subscriptionFixture({
      id: 'sub_old',
      created: 1_000_000_000,
      status: 'canceled',
      metadata: { business_id: 'biz-1', billing_generation: '1' }
    });
    const result = await syncSubscriptionFromStripe(supabase, delayedOlder.stripe, 'sub_old');

    expect(result).toEqual({ ok: true });
    expect(rows.get('biz-1')?.stripe_subscription_id).toBe('sub_new');
    expect(rows.get('biz-1')?.status).toBe('active');
  });

  it('resolves two subscriptions created in the same one-second Stripe timestamp deterministically via generation, never by comparing Stripe ids lexically', async () => {
    const { rpc, rows } = fakeSyncRpcTable();
    const supabase = { rpc } as unknown as SupabaseClient;
    const sameSecond = 1_800_000_000;

    // `sub_zzz` sorts AFTER `sub_aaa` lexically but has the EARLIER
    // generation — if ordering were ever done by comparing ids, this
    // would (wrongly) let it win. Generation must decide instead.
    const first = subscriptionFixture({
      id: 'sub_zzz',
      created: sameSecond,
      status: 'trialing',
      metadata: { business_id: 'biz-1', billing_generation: '1' }
    });
    await syncSubscriptionFromStripe(supabase, first.stripe, 'sub_zzz');

    const second = subscriptionFixture({
      id: 'sub_aaa',
      created: sameSecond,
      status: 'active',
      metadata: { business_id: 'biz-1', billing_generation: '2' }
    });
    await syncSubscriptionFromStripe(supabase, second.stripe, 'sub_aaa');

    expect(rows.get('biz-1')?.stripe_subscription_id).toBe('sub_aaa');

    // And the reverse: the lower-generation one, even lexically later,
    // must never be able to reclaim the row afterward.
    const delayedFirst = subscriptionFixture({
      id: 'sub_zzz',
      created: sameSecond,
      status: 'canceled',
      metadata: { business_id: 'biz-1', billing_generation: '1' }
    });
    await syncSubscriptionFromStripe(supabase, delayedFirst.stripe, 'sub_zzz');

    expect(rows.get('biz-1')?.stripe_subscription_id).toBe('sub_aaa');
  });

  it('still applies an update for the CURRENT subscription even when it is not a strictly newer generation', async () => {
    const { rpc, rows } = fakeSyncRpcTable();
    const supabase = { rpc } as unknown as SupabaseClient;

    const created = subscriptionFixture({
      id: 'sub_1',
      created: 1_500_000_000,
      metadata: { business_id: 'biz-1', billing_generation: '1' }
    });
    await syncSubscriptionFromStripe(supabase, created.stripe, 'sub_1');

    // Same subscription id, a later status-change event — same
    // generation, never "newer," but still the current subscription.
    const updated = subscriptionFixture({
      id: 'sub_1',
      created: 1_500_000_000,
      status: 'past_due',
      metadata: { business_id: 'biz-1', billing_generation: '1' }
    });
    const result = await syncSubscriptionFromStripe(supabase, updated.stripe, 'sub_1');

    expect(result).toEqual({ ok: true });
    expect(rows.get('biz-1')?.status).toBe('past_due');
  });

  it('keeps duplicate delivery of the same event idempotent and safe', async () => {
    const { rpc, rows } = fakeSyncRpcTable();
    const supabase = { rpc } as unknown as SupabaseClient;
    const subscription = subscriptionFixture({
      id: 'sub_1',
      created: 1_500_000_000,
      metadata: { business_id: 'biz-1', billing_generation: '1' }
    });

    await syncSubscriptionFromStripe(supabase, subscription.stripe, 'sub_1');
    const secondDelivery = await syncSubscriptionFromStripe(supabase, subscription.stripe, 'sub_1');

    expect(secondDelivery).toEqual({ ok: true });
    expect(rows.get('biz-1')?.stripe_subscription_id).toBe('sub_1');
  });

  it('sets trial_used_at the first time a real trial syncs, and never clears or replaces it on a later resubscribe under a new subscription id/generation', async () => {
    const { rpc, rows } = fakeSyncRpcTable();
    const supabase = { rpc } as unknown as SupabaseClient;

    const firstTrial = subscriptionFixture({
      id: 'sub_first',
      created: 1_000_000_000,
      trial_start: 1_000_000_000,
      metadata: { business_id: 'biz-1', billing_generation: '1' }
    });
    await syncSubscriptionFromStripe(supabase, firstTrial.stripe, 'sub_first');
    expect(rows.get('biz-1')?.trial_used_at).toBe('trial-used');

    const resubscribed = subscriptionFixture({
      id: 'sub_second',
      created: 3_000_000_000,
      status: 'active',
      trial_start: null,
      trial_end: null,
      metadata: { business_id: 'biz-1', billing_generation: '2' }
    });
    await syncSubscriptionFromStripe(supabase, resubscribed.stripe, 'sub_second');

    expect(rows.get('biz-1')?.trial_used_at).toBe('trial-used');
    expect(rows.get('biz-1')?.stripe_subscription_id).toBe('sub_second');
  });

  it('never lets a duplicate/stale webhook for the same original trial reset trial_used_at', async () => {
    const { rpc, rows } = fakeSyncRpcTable();
    const supabase = { rpc } as unknown as SupabaseClient;

    const trial = subscriptionFixture({
      id: 'sub_first',
      created: 1_000_000_000,
      trial_start: 1_000_000_000,
      metadata: { business_id: 'biz-1', billing_generation: '1' }
    });
    await syncSubscriptionFromStripe(supabase, trial.stripe, 'sub_first');
    const firstMarker = rows.get('biz-1')?.trial_used_at;

    await syncSubscriptionFromStripe(supabase, trial.stripe, 'sub_first');

    expect(rows.get('biz-1')?.trial_used_at).toBe(firstMarker);
  });
});

describe('sync_business_subscription — trial usage recorded independently of stale-subscription rejection (item 3)', () => {
  it('a delayed, older, genuinely-trialed subscription still permanently marks trial_used_at even though it cannot replace the newer current subscription', async () => {
    const { rpc, rows } = fakeSyncRpcTable();
    const supabase = { rpc } as unknown as SupabaseClient;

    // The current subscription is a newer, non-trial one.
    const newerNonTrial = subscriptionFixture({
      id: 'sub_new',
      created: 2_000_000_000,
      status: 'active',
      trial_start: null,
      trial_end: null,
      metadata: { business_id: 'biz-1', billing_generation: '2' }
    });
    await syncSubscriptionFromStripe(supabase, newerNonTrial.stripe, 'sub_new');
    expect(rows.get('biz-1')?.trial_used_at).toBeNull();

    // A delayed webhook for an OLDER subscription that genuinely had a
    // trial arrives after — its lower generation means it can never
    // replace the current subscription's state.
    const delayedOlderTrial = subscriptionFixture({
      id: 'sub_old',
      created: 1_000_000_000,
      status: 'trialing',
      trial_start: 1_000_000_000,
      metadata: { business_id: 'biz-1', billing_generation: '1' }
    });
    const result = await syncSubscriptionFromStripe(supabase, delayedOlderTrial.stripe, 'sub_old');

    expect(result).toEqual({ ok: true });
    // The current subscription is untouched.
    expect(rows.get('biz-1')?.stripe_subscription_id).toBe('sub_new');
    expect(rows.get('biz-1')?.status).toBe('active');
    // But trial usage is now permanently recorded — a future Checkout
    // for this business must never offer a trial again.
    expect(rows.get('biz-1')?.trial_used_at).not.toBeNull();
  });
});
