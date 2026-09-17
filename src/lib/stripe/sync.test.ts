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
  metadata: { business_id: 'biz-1' },
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
 * A faithful, in-memory re-implementation of the `sync_business_subscription`
 * Postgres function's own conflict-resolution logic (see the migration),
 * used as the `.rpc()` mock here so these tests exercise the actual
 * ordering/idempotency semantics end-to-end — not just "were these
 * arguments passed." There is no live Postgres instance in this
 * environment; the atomic guarantee itself (this all happens inside one
 * SQL statement, never a JS read-then-write) is verified separately by
 * the migration's own static contract test, which asserts the exact
 * `on conflict ... do update ... where <ordering guard>` SQL shape.
 */
function fakeSyncRpcTable() {
  type Row = {
    stripe_subscription_id: string | null;
    stripe_subscription_created_at: string | null;
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
    const incomingSubscriptionId = params.p_stripe_subscription_id as string;

    const shouldApply =
      !existing ||
      existing.stripe_subscription_id === null ||
      existing.stripe_subscription_id === incomingSubscriptionId ||
      existing.stripe_subscription_created_at === null ||
      incomingCreatedAt === null ||
      incomingCreatedAt >= existing.stripe_subscription_created_at;

    if (!shouldApply) {
      return { error: null }; // successful no-op — mirrors the WHERE guard matching zero rows
    }

    rows.set(businessId, {
      stripe_subscription_id: incomingSubscriptionId,
      stripe_subscription_created_at: incomingCreatedAt,
      status: params.p_status as string,
      trial_used_at: existing?.trial_used_at ?? (params.p_trial_start ? 'trial-used' : null),
      stripe_customer_id: params.p_stripe_customer_id,
      current_period_end: params.p_current_period_end
    });
    return { error: null };
  });

  return { rpc, rows };
}

describe('sync_business_subscription ordering semantics (via the RPC mock)', () => {
  it('lets a newer subscription replace an older one on file', async () => {
    const { rpc, rows } = fakeSyncRpcTable();
    const supabase = { rpc } as unknown as SupabaseClient;

    const older = mockStripe({
      ...BASE_SUBSCRIPTION,
      id: 'sub_old',
      created: 1_000_000_000,
      status: 'canceled'
    });
    await syncSubscriptionFromStripe(supabase, older.stripe, 'sub_old');

    const newer = mockStripe({
      ...BASE_SUBSCRIPTION,
      id: 'sub_new',
      created: 2_000_000_000,
      status: 'active'
    });
    await syncSubscriptionFromStripe(supabase, newer.stripe, 'sub_new');

    expect(rows.get('biz-1')?.stripe_subscription_id).toBe('sub_new');
    expect(rows.get('biz-1')?.status).toBe('active');
  });

  it('refuses to let a delayed webhook from an older subscription overwrite the newer one already on file', async () => {
    const { rpc, rows } = fakeSyncRpcTable();
    const supabase = { rpc } as unknown as SupabaseClient;

    const newer = mockStripe({
      ...BASE_SUBSCRIPTION,
      id: 'sub_new',
      created: 2_000_000_000,
      status: 'active'
    });
    await syncSubscriptionFromStripe(supabase, newer.stripe, 'sub_new');

    // A stale, out-of-order delivery for the OLD subscription arrives after.
    const delayedOlder = mockStripe({
      ...BASE_SUBSCRIPTION,
      id: 'sub_old',
      created: 1_000_000_000,
      status: 'canceled'
    });
    const result = await syncSubscriptionFromStripe(supabase, delayedOlder.stripe, 'sub_old');

    // A safe, successful no-op — never an error, and the newer row is untouched.
    expect(result).toEqual({ ok: true });
    expect(rows.get('biz-1')?.stripe_subscription_id).toBe('sub_new');
    expect(rows.get('biz-1')?.status).toBe('active');
  });

  it('still applies an update for the CURRENT subscription even when its own created_at is not newer', async () => {
    const { rpc, rows } = fakeSyncRpcTable();
    const supabase = { rpc } as unknown as SupabaseClient;

    const created = mockStripe({ ...BASE_SUBSCRIPTION, id: 'sub_1', created: 1_500_000_000 });
    await syncSubscriptionFromStripe(supabase, created.stripe, 'sub_1');

    // Same subscription id, a later status-change event — created_at is
    // identical (it's the same Stripe object), never "newer."
    const updated = mockStripe({
      ...BASE_SUBSCRIPTION,
      id: 'sub_1',
      created: 1_500_000_000,
      status: 'past_due'
    });
    const result = await syncSubscriptionFromStripe(supabase, updated.stripe, 'sub_1');

    expect(result).toEqual({ ok: true });
    expect(rows.get('biz-1')?.status).toBe('past_due');
  });

  it('keeps duplicate delivery of the same event idempotent and safe', async () => {
    const { rpc, rows } = fakeSyncRpcTable();
    const supabase = { rpc } as unknown as SupabaseClient;
    const subscription = mockStripe({ ...BASE_SUBSCRIPTION, id: 'sub_1', created: 1_500_000_000 });

    await syncSubscriptionFromStripe(supabase, subscription.stripe, 'sub_1');
    const secondDelivery = await syncSubscriptionFromStripe(supabase, subscription.stripe, 'sub_1');

    expect(secondDelivery).toEqual({ ok: true });
    expect(rows.get('biz-1')?.stripe_subscription_id).toBe('sub_1');
  });

  it('sets trial_used_at the first time a real trial syncs, and never clears or replaces it on a later resubscribe under a new subscription id', async () => {
    const { rpc, rows } = fakeSyncRpcTable();
    const supabase = { rpc } as unknown as SupabaseClient;

    const firstTrial = mockStripe({
      ...BASE_SUBSCRIPTION,
      id: 'sub_first',
      created: 1_000_000_000,
      trial_start: 1_000_000_000
    });
    await syncSubscriptionFromStripe(supabase, firstTrial.stripe, 'sub_first');
    expect(rows.get('biz-1')?.trial_used_at).toBe('trial-used');

    // Cancel, then resubscribe under a brand-new subscription id, itself
    // with no trial this time (startCheckout() would have omitted
    // trial_period_days — see service.test.ts) — trial_used_at must stay
    // exactly as it was, never reset by the new row.
    const resubscribed = mockStripe({
      ...BASE_SUBSCRIPTION,
      id: 'sub_second',
      created: 3_000_000_000,
      status: 'active',
      trial_start: null,
      trial_end: null
    });
    await syncSubscriptionFromStripe(supabase, resubscribed.stripe, 'sub_second');

    expect(rows.get('biz-1')?.trial_used_at).toBe('trial-used');
    expect(rows.get('biz-1')?.stripe_subscription_id).toBe('sub_second');
  });

  it('never lets a duplicate/stale webhook for the same original trial reset trial_used_at', async () => {
    const { rpc, rows } = fakeSyncRpcTable();
    const supabase = { rpc } as unknown as SupabaseClient;

    const trial = mockStripe({
      ...BASE_SUBSCRIPTION,
      id: 'sub_first',
      created: 1_000_000_000,
      trial_start: 1_000_000_000
    });
    await syncSubscriptionFromStripe(supabase, trial.stripe, 'sub_first');
    const firstMarker = rows.get('biz-1')?.trial_used_at;

    // Duplicate delivery of the very same event.
    await syncSubscriptionFromStripe(supabase, trial.stripe, 'sub_first');

    expect(rows.get('biz-1')?.trial_used_at).toBe(firstMarker);
  });
});
