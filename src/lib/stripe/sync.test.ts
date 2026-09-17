import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { syncSubscriptionFromStripe } from './sync';

function mockSupabase(result: { error: { code?: string; message?: string } | null }) {
  const upsertFn = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ upsert: upsertFn });
  return { supabase: { from } as unknown as SupabaseClient, upsertFn, from };
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

  it('upserts business_subscriptions keyed on business_id, mapping every field from the live subscription', async () => {
    const { stripe } = mockStripe(BASE_SUBSCRIPTION);
    const { supabase, upsertFn, from } = mockSupabase({ error: null });

    const result = await syncSubscriptionFromStripe(supabase, stripe, 'sub_123');

    expect(result).toEqual({ ok: true });
    expect(from).toHaveBeenCalledWith('business_subscriptions');
    expect(upsertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        business_id: 'biz-1',
        stripe_customer_id: 'cus_123',
        stripe_subscription_id: 'sub_123',
        stripe_price_id: 'price_abc',
        status: 'trialing',
        cancel_at_period_end: false,
        canceled_at: null,
        trial_start: new Date(1_700_000_000 * 1000).toISOString(),
        trial_end: new Date(1_700_600_000 * 1000).toISOString(),
        current_period_start: new Date(1_700_000_000 * 1000).toISOString(),
        current_period_end: new Date(1_702_600_000 * 1000).toISOString()
      }),
      { onConflict: 'business_id' }
    );
  });

  it('resolves a fully-expanded customer object to its id, not the whole object', async () => {
    const { stripe } = mockStripe({
      ...BASE_SUBSCRIPTION,
      customer: { id: 'cus_expanded' } as unknown as Stripe.Subscription['customer']
    });
    const { supabase, upsertFn } = mockSupabase({ error: null });

    await syncSubscriptionFromStripe(supabase, stripe, 'sub_123');

    expect(upsertFn).toHaveBeenCalledWith(
      expect.objectContaining({ stripe_customer_id: 'cus_expanded' }),
      expect.anything()
    );
  });

  it('maps a canceled subscription’s status and canceled_at without deleting anything — the caller decides whether to write, never this function', async () => {
    const { stripe } = mockStripe({
      ...BASE_SUBSCRIPTION,
      status: 'canceled',
      canceled_at: 1_703_000_000,
      cancel_at_period_end: false
    });
    const { supabase, upsertFn } = mockSupabase({ error: null });

    const result = await syncSubscriptionFromStripe(supabase, stripe, 'sub_123');

    expect(result).toEqual({ ok: true });
    expect(upsertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'canceled',
        canceled_at: new Date(1_703_000_000 * 1000).toISOString()
      }),
      expect.anything()
    );
  });

  it('refuses to sync a subscription with no business_id metadata — never guesses which business it belongs to', async () => {
    const { stripe } = mockStripe({
      ...BASE_SUBSCRIPTION,
      metadata: {}
    });
    const { supabase, upsertFn } = mockSupabase({ error: null });

    const result = await syncSubscriptionFromStripe(supabase, stripe, 'sub_123');

    expect(result).toEqual({ ok: false, reason: 'missing_business_id_metadata' });
    expect(upsertFn).not.toHaveBeenCalled();
  });

  it('reports a DB error instead of silently succeeding', async () => {
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
    const { supabase, upsertFn } = mockSupabase({ error: null });

    await syncSubscriptionFromStripe(supabase, stripe, 'sub_123');

    expect(upsertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        trial_start: null,
        trial_end: null,
        current_period_start: null,
        current_period_end: null
      }),
      expect.anything()
    );
  });
});
