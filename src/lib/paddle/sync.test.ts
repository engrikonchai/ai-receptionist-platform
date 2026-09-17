import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { syncSubscriptionFromPaddle, type PaddleSubscriptionLike } from './sync';

function mockSupabase(result: { error: { code?: string; message?: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { supabase: { rpc } as unknown as SupabaseClient, rpc };
}

const BASE_SUBSCRIPTION: PaddleSubscriptionLike = {
  id: 'sub_01',
  status: 'trialing',
  customerId: 'ctm_01',
  createdAt: '2026-01-01T00:00:00.000Z',
  canceledAt: null,
  customData: { business_id: 'biz-1', billing_generation: 1 },
  currentBillingPeriod: {
    startsAt: '2026-01-01T00:00:00.000Z',
    endsAt: '2026-01-15T00:00:00.000Z'
  },
  scheduledChange: null,
  items: [
    {
      price: { id: 'pri_01' },
      trialDates: { startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-01-15T00:00:00.000Z' }
    }
  ]
};

const EVENT_OCCURRED_AT = '2026-01-01T00:05:00.000Z';

describe('syncSubscriptionFromPaddle', () => {
  it('synchronizes via the atomic sync_business_subscription RPC, mapping every field from the Paddle subscription', async () => {
    const { supabase, rpc } = mockSupabase({ error: null });

    const result = await syncSubscriptionFromPaddle(
      supabase,
      BASE_SUBSCRIPTION,
      EVENT_OCCURRED_AT,
      'txn_01'
    );

    expect(result).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('sync_business_subscription', {
      p_business_id: 'biz-1',
      p_paddle_customer_id: 'ctm_01',
      p_paddle_subscription_id: 'sub_01',
      p_paddle_transaction_id: 'txn_01',
      p_paddle_subscription_created_at: '2026-01-01T00:00:00.000Z',
      p_paddle_event_occurred_at: EVENT_OCCURRED_AT,
      p_billing_generation: 1,
      p_paddle_price_id: 'pri_01',
      p_status: 'trialing',
      p_trial_start: '2026-01-01T00:00:00.000Z',
      p_trial_end: '2026-01-15T00:00:00.000Z',
      p_current_period_start: '2026-01-01T00:00:00.000Z',
      p_current_period_end: '2026-01-15T00:00:00.000Z',
      p_cancel_at_period_end: false,
      p_canceled_at: null
    });
  });

  it('defaults latestTransactionId to null when not supplied (a subscription.* event carries no transaction id)', async () => {
    const { supabase, rpc } = mockSupabase({ error: null });

    await syncSubscriptionFromPaddle(supabase, BASE_SUBSCRIPTION, EVENT_OCCURRED_AT);

    expect(rpc).toHaveBeenCalledWith(
      'sync_business_subscription',
      expect.objectContaining({ p_paddle_transaction_id: null })
    );
  });

  it('derives cancel_at_period_end from a scheduled cancel change', async () => {
    const { supabase, rpc } = mockSupabase({ error: null });

    await syncSubscriptionFromPaddle(
      supabase,
      { ...BASE_SUBSCRIPTION, scheduledChange: { action: 'cancel' } },
      EVENT_OCCURRED_AT
    );

    expect(rpc).toHaveBeenCalledWith(
      'sync_business_subscription',
      expect.objectContaining({ p_cancel_at_period_end: true })
    );
  });

  it('never treats a scheduled pause/resume as cancel_at_period_end', async () => {
    const { supabase, rpc } = mockSupabase({ error: null });

    await syncSubscriptionFromPaddle(
      supabase,
      { ...BASE_SUBSCRIPTION, scheduledChange: { action: 'pause' } },
      EVENT_OCCURRED_AT
    );

    expect(rpc).toHaveBeenCalledWith(
      'sync_business_subscription',
      expect.objectContaining({ p_cancel_at_period_end: false })
    );
  });

  it('maps a canceled subscription’s status and canceledAt — the database, not this function, decides whether the write applies', async () => {
    const { supabase, rpc } = mockSupabase({ error: null });

    const result = await syncSubscriptionFromPaddle(
      supabase,
      {
        ...BASE_SUBSCRIPTION,
        status: 'canceled',
        canceledAt: '2026-02-01T00:00:00.000Z'
      },
      EVENT_OCCURRED_AT
    );

    expect(result).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith(
      'sync_business_subscription',
      expect.objectContaining({ p_status: 'canceled', p_canceled_at: '2026-02-01T00:00:00.000Z' })
    );
  });

  it('refuses to sync a subscription with no business_id in custom_data — never guesses which business it belongs to', async () => {
    const { supabase, rpc } = mockSupabase({ error: null });

    const result = await syncSubscriptionFromPaddle(
      supabase,
      { ...BASE_SUBSCRIPTION, customData: {} },
      EVENT_OCCURRED_AT
    );

    expect(result).toEqual({ ok: false, reason: 'missing_business_id_custom_data' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses to sync when custom_data is entirely absent', async () => {
    const { supabase, rpc } = mockSupabase({ error: null });

    const result = await syncSubscriptionFromPaddle(
      supabase,
      { ...BASE_SUBSCRIPTION, customData: null },
      EVENT_OCCURRED_AT
    );

    expect(result).toEqual({ ok: false, reason: 'missing_business_id_custom_data' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes null billing_generation when custom_data has none (predates the column, or was not created through startCheckout())', async () => {
    const { supabase, rpc } = mockSupabase({ error: null });

    await syncSubscriptionFromPaddle(
      supabase,
      { ...BASE_SUBSCRIPTION, customData: { business_id: 'biz-1' } },
      EVENT_OCCURRED_AT
    );

    expect(rpc).toHaveBeenCalledWith(
      'sync_business_subscription',
      expect.objectContaining({ p_billing_generation: null })
    );
  });

  it('reports a DB/RPC error instead of silently succeeding', async () => {
    const { supabase } = mockSupabase({ error: { code: '23503', message: 'fk violation' } });

    const result = await syncSubscriptionFromPaddle(supabase, BASE_SUBSCRIPTION, EVENT_OCCURRED_AT);

    expect(result).toEqual({ ok: false, reason: '23503' });
  });

  it('writes null for trial/period fields when the subscription has none', async () => {
    const { supabase, rpc } = mockSupabase({ error: null });

    await syncSubscriptionFromPaddle(
      supabase,
      {
        ...BASE_SUBSCRIPTION,
        currentBillingPeriod: null,
        items: [{ price: { id: 'pri_01' }, trialDates: null }]
      },
      EVENT_OCCURRED_AT
    );

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
 * A faithful, in-memory re-implementation of the real
 * `sync_business_subscription` Postgres function's own two-statement
 * design (see the migration), used as the `.rpc()` mock here so these
 * tests exercise the actual ordering/idempotency/trial semantics
 * end-to-end — not just "were these arguments passed." There is no live
 * Postgres instance in this environment; the atomic guarantee itself is
 * verified separately by the migration's own static contract test.
 */
function fakeSyncRpcTable() {
  type Row = {
    paddle_subscription_id: string | null;
    paddle_subscription_created_at: string | null;
    paddle_event_occurred_at: string | null;
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
    const incomingSubscriptionId = params.p_paddle_subscription_id as string;
    const incomingOccurredAt = params.p_paddle_event_occurred_at as string | null;
    const incomingGeneration = params.p_billing_generation as number | null;
    const incomingCreatedAt = params.p_paddle_subscription_created_at as string | null;
    const incomingTrialStart = params.p_trial_start as string | null;

    // Statement 1 — independent, immutable trial usage.
    if (existing && existing.trial_used_at === null && incomingTrialStart !== null) {
      existing.trial_used_at = 'trial-used';
    }

    // Statement 2 — the guarded subscription-state upsert.
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

    rows.set(businessId, {
      paddle_subscription_id: incomingSubscriptionId,
      paddle_subscription_created_at: incomingCreatedAt,
      paddle_event_occurred_at: incomingOccurredAt,
      billing_generation: incomingGeneration,
      status: params.p_status as string,
      trial_used_at: existing?.trial_used_at ?? (incomingTrialStart !== null ? 'trial-used' : null)
    });
    return { error: null };
  });

  return { rpc, rows };
}

function subscription(overrides: Partial<PaddleSubscriptionLike>): PaddleSubscriptionLike {
  return { ...BASE_SUBSCRIPTION, ...overrides };
}

describe('sync_business_subscription ordering semantics (via the RPC mock)', () => {
  it('lets a newer subscription (higher generation) replace an older one on file', async () => {
    const { rpc, rows } = fakeSyncRpcTable();
    const supabase = { rpc } as unknown as SupabaseClient;

    await syncSubscriptionFromPaddle(
      supabase,
      subscription({
        id: 'sub_old',
        createdAt: '2026-01-01T00:00:00.000Z',
        status: 'canceled',
        customData: { business_id: 'biz-1', billing_generation: 1 }
      }),
      '2026-01-01T00:00:00.000Z'
    );

    await syncSubscriptionFromPaddle(
      supabase,
      subscription({
        id: 'sub_new',
        createdAt: '2026-02-01T00:00:00.000Z',
        status: 'active',
        customData: { business_id: 'biz-1', billing_generation: 2 }
      }),
      '2026-02-01T00:00:00.000Z'
    );

    expect(rows.get('biz-1')?.paddle_subscription_id).toBe('sub_new');
    expect(rows.get('biz-1')?.status).toBe('active');
  });

  it('refuses to let a delayed webhook from an older subscription (lower generation) overwrite the newer one already on file', async () => {
    const { rpc, rows } = fakeSyncRpcTable();
    const supabase = { rpc } as unknown as SupabaseClient;

    await syncSubscriptionFromPaddle(
      supabase,
      subscription({
        id: 'sub_new',
        status: 'active',
        customData: { business_id: 'biz-1', billing_generation: 2 }
      }),
      '2026-02-01T00:00:00.000Z'
    );

    const result = await syncSubscriptionFromPaddle(
      supabase,
      subscription({
        id: 'sub_old',
        status: 'canceled',
        customData: { business_id: 'biz-1', billing_generation: 1 }
      }),
      '2026-01-01T00:00:00.000Z'
    );

    expect(result).toEqual({ ok: true });
    expect(rows.get('biz-1')?.paddle_subscription_id).toBe('sub_new');
    expect(rows.get('biz-1')?.status).toBe('active');
  });

  it('refuses to let an out-of-order event for the SAME subscription overwrite a later event already applied', async () => {
    const { rpc, rows } = fakeSyncRpcTable();
    const supabase = { rpc } as unknown as SupabaseClient;

    // A later event (occurred_at = 12:00) is somehow delivered first.
    await syncSubscriptionFromPaddle(
      supabase,
      subscription({ id: 'sub_1', status: 'active' }),
      '2026-01-01T12:00:00.000Z'
    );

    // An earlier event (occurred_at = 11:00) for the SAME subscription
    // arrives after — Paddle does not guarantee delivery order.
    const result = await syncSubscriptionFromPaddle(
      supabase,
      subscription({ id: 'sub_1', status: 'past_due' }),
      '2026-01-01T11:00:00.000Z'
    );

    expect(result).toEqual({ ok: true });
    // The later, already-applied state is untouched.
    expect(rows.get('biz-1')?.status).toBe('active');
  });

  it('still applies a later event for the same subscription when it genuinely occurred after', async () => {
    const { rpc, rows } = fakeSyncRpcTable();
    const supabase = { rpc } as unknown as SupabaseClient;

    await syncSubscriptionFromPaddle(
      supabase,
      subscription({ id: 'sub_1', status: 'trialing' }),
      '2026-01-01T11:00:00.000Z'
    );
    await syncSubscriptionFromPaddle(
      supabase,
      subscription({ id: 'sub_1', status: 'active' }),
      '2026-01-01T12:00:00.000Z'
    );

    expect(rows.get('biz-1')?.status).toBe('active');
  });

  it('resolves two subscriptions created in the same one-second timestamp deterministically via generation, never by comparing Paddle ids lexically', async () => {
    const { rpc, rows } = fakeSyncRpcTable();
    const supabase = { rpc } as unknown as SupabaseClient;
    const sameSecond = '2026-03-01T00:00:00.000Z';

    await syncSubscriptionFromPaddle(
      supabase,
      subscription({
        id: 'sub_zzz',
        createdAt: sameSecond,
        status: 'trialing',
        customData: { business_id: 'biz-1', billing_generation: 1 }
      }),
      sameSecond
    );
    await syncSubscriptionFromPaddle(
      supabase,
      subscription({
        id: 'sub_aaa',
        createdAt: sameSecond,
        status: 'active',
        customData: { business_id: 'biz-1', billing_generation: 2 }
      }),
      sameSecond
    );

    expect(rows.get('biz-1')?.paddle_subscription_id).toBe('sub_aaa');
  });

  it('keeps duplicate delivery of the same event idempotent and safe', async () => {
    const { rpc, rows } = fakeSyncRpcTable();
    const supabase = { rpc } as unknown as SupabaseClient;

    await syncSubscriptionFromPaddle(supabase, subscription({ id: 'sub_1' }), EVENT_OCCURRED_AT);
    const secondDelivery = await syncSubscriptionFromPaddle(
      supabase,
      subscription({ id: 'sub_1' }),
      EVENT_OCCURRED_AT
    );

    expect(secondDelivery).toEqual({ ok: true });
    expect(rows.get('biz-1')?.paddle_subscription_id).toBe('sub_1');
  });

  it('sets trial_used_at the first time a real trial syncs, and never clears it on a later resubscribe under a new subscription id/generation', async () => {
    const { rpc, rows } = fakeSyncRpcTable();
    const supabase = { rpc } as unknown as SupabaseClient;

    await syncSubscriptionFromPaddle(
      supabase,
      subscription({
        id: 'sub_first',
        customData: { business_id: 'biz-1', billing_generation: 1 }
      }),
      '2026-01-01T00:00:00.000Z'
    );
    expect(rows.get('biz-1')?.trial_used_at).toBe('trial-used');

    await syncSubscriptionFromPaddle(
      supabase,
      subscription({
        id: 'sub_second',
        status: 'active',
        items: [{ price: { id: 'pri_01' }, trialDates: null }],
        customData: { business_id: 'biz-1', billing_generation: 2 }
      }),
      '2026-03-01T00:00:00.000Z'
    );

    expect(rows.get('biz-1')?.trial_used_at).toBe('trial-used');
    expect(rows.get('biz-1')?.paddle_subscription_id).toBe('sub_second');
  });

  it('permanently records trial usage from a stale/older subscription even though its state is correctly rejected as too old', async () => {
    const { rpc, rows } = fakeSyncRpcTable();
    const supabase = { rpc } as unknown as SupabaseClient;

    await syncSubscriptionFromPaddle(
      supabase,
      subscription({
        id: 'sub_new',
        status: 'active',
        items: [{ price: { id: 'pri_01' }, trialDates: null }],
        customData: { business_id: 'biz-1', billing_generation: 2 }
      }),
      '2026-02-01T00:00:00.000Z'
    );
    expect(rows.get('biz-1')?.trial_used_at).toBeNull();

    const result = await syncSubscriptionFromPaddle(
      supabase,
      subscription({
        id: 'sub_old',
        status: 'trialing',
        customData: { business_id: 'biz-1', billing_generation: 1 }
      }),
      '2026-01-01T00:00:00.000Z'
    );

    expect(result).toEqual({ ok: true });
    expect(rows.get('biz-1')?.paddle_subscription_id).toBe('sub_new');
    expect(rows.get('biz-1')?.trial_used_at).not.toBeNull();
  });
});
