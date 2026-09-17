import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { verifyActiveBusiness } from './authorize';
import { SESSION_EXPIRED_MESSAGE, NO_BUSINESS_ACCESS_MESSAGE } from './types';
import { fetchBillingStatus, openCustomerPortal, startCheckout } from './service';

vi.mock('./authorize', () => ({
  verifyActiveBusiness: vi.fn()
}));

const getStripeClient = vi.fn();
const getStripePriceId = vi.fn();
const isStripeConfigured = vi.fn();
const getSiteUrl = vi.fn();

vi.mock('@/lib/stripe/client', () => ({
  getStripeClient: (...args: unknown[]) => getStripeClient(...args),
  getStripePriceId: (...args: unknown[]) => getStripePriceId(...args),
  isStripeConfigured: (...args: unknown[]) => isStripeConfigured(...args)
}));

vi.mock('@/lib/site-url', () => ({
  getSiteUrl: (...args: unknown[]) => getSiteUrl(...args)
}));

/** Same stand-in for Supabase's PostgREST query builder used across this repo's other service.test.ts files. */
function chainable<T>(result: T) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (value: T) => void, reject?: (reason: unknown) => void) =>
            Promise.resolve(result).then(resolve, reject);
        }
        if (prop === 'catch') {
          return (reject: (reason: unknown) => void) => Promise.resolve(result).catch(reject);
        }
        return () => proxy;
      }
    }
  );
  return proxy;
}

const stubUser = { id: 'user-1' } as unknown as User;
const VERIFIED_BUSINESS_ID = 'biz-1';

function mockVerifiedBusiness(from: ReturnType<typeof vi.fn>, businessId = VERIFIED_BUSINESS_ID) {
  vi.mocked(verifyActiveBusiness).mockResolvedValue({
    ok: true,
    ctx: { supabase: { from } as unknown as SupabaseClient, user: stubUser, businessId }
  });
}

const TEST_SITE_URL = 'https://app.example.com';

beforeEach(() => {
  vi.clearAllMocks();
  getSiteUrl.mockReturnValue(TEST_SITE_URL);
  isStripeConfigured.mockReturnValue(true);
  getStripePriceId.mockReturnValue('price_123');
});

describe('startCheckout — authorization', () => {
  it('rejects an unauthenticated caller instead of ever calling Stripe', async () => {
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: false,
      error: SESSION_EXPIRED_MESSAGE
    });
    const createSession = vi.fn();
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'error', error: SESSION_EXPIRED_MESSAGE });
    expect(createSession).not.toHaveBeenCalled();
  });

  it('rejects a business id that does not belong to the signed-in owner (cross-business)', async () => {
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: false,
      error: NO_BUSINESS_ACCESS_MESSAGE
    });
    const createSession = vi.fn();
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    const result = await startCheckout('business-someone-else-owns');

    expect(result).toEqual({ status: 'error', error: NO_BUSINESS_ACCESS_MESSAGE });
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe('startCheckout — configuration', () => {
  it('returns not_configured when Stripe is not configured', async () => {
    const from = vi.fn();
    mockVerifiedBusiness(from);
    getStripeClient.mockReturnValue(null);

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'not_configured' });
    expect(from).not.toHaveBeenCalled();
  });

  it('returns not_configured when no price id is configured', async () => {
    const from = vi.fn();
    mockVerifiedBusiness(from);
    getStripePriceId.mockReturnValue(null);
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: vi.fn() } } });

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'not_configured' });
  });
});

describe('startCheckout — duplicate prevention and customer reuse', () => {
  it('refuses to start a second Checkout when the business already has active access', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: { status: 'active', stripe_customer_id: 'cus_1' } }));
    mockVerifiedBusiness(from);
    const createSession = vi.fn();
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'already_subscribed' });
    expect(createSession).not.toHaveBeenCalled();
  });

  it('refuses to start a second Checkout while trialing', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(
        chainable({ data: { status: 'trialing', stripe_customer_id: 'cus_1' } })
      );
    mockVerifiedBusiness(from);
    const createSession = vi.fn();
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'already_subscribed' });
  });

  it('allows a new Checkout for a past_due/canceled/incomplete business — recovery, not a duplicate', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(
        chainable({ data: { status: 'past_due', stripe_customer_id: 'cus_1' } })
      );
    mockVerifiedBusiness(from);
    const createSession = vi
      .fn()
      .mockResolvedValue({ url: 'https://checkout.stripe.com/session_abc' });
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'ok', url: 'https://checkout.stripe.com/session_abc' });
    expect(createSession).toHaveBeenCalled();
  });

  it('reuses an existing Stripe customer id instead of letting Stripe create a new one', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(
        chainable({ data: { status: 'canceled', stripe_customer_id: 'cus_existing' } })
      );
    mockVerifiedBusiness(from);
    const createSession = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/x' });
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    await startCheckout('biz-1');

    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_existing' })
    );
  });

  it('omits the customer field entirely for a business with no Stripe customer yet — Stripe creates one', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness(from);
    const createSession = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/x' });
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    await startCheckout('biz-1');

    const callArgs = createSession.mock.calls[0][0];
    expect(callArgs.customer).toBeUndefined();
  });
});

describe('startCheckout — session configuration', () => {
  it('creates a subscription-mode session with a 14-day trial and the configured price', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness(from);
    const createSession = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/x' });
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    await startCheckout('biz-1');

    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        line_items: [{ price: 'price_123', quantity: 1 }],
        subscription_data: expect.objectContaining({ trial_period_days: 14 })
      })
    );
  });

  it('attaches the verified business id as trusted metadata on both the session and the subscription — never anything the browser supplied', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness(from, 'biz-verified');
    const createSession = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/x' });
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    await startCheckout('biz-verified');

    const callArgs = createSession.mock.calls[0][0];
    expect(callArgs.metadata).toEqual({ business_id: 'biz-verified' });
    expect(callArgs.subscription_data.metadata).toEqual({ business_id: 'biz-verified' });
  });

  it('builds success/cancel URLs from NEXT_PUBLIC_SITE_URL only — never a request Host header (this function never even receives a Request)', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness(from);
    const createSession = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/x' });
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    await startCheckout('biz-1');

    const callArgs = createSession.mock.calls[0][0];
    expect(callArgs.success_url).toBe(`${TEST_SITE_URL}/dashboard/billing?checkout=success`);
    expect(callArgs.cancel_url).toBe(`${TEST_SITE_URL}/dashboard/billing?checkout=canceled`);
    expect(getSiteUrl).toHaveBeenCalled();
  });

  it('reports a generic error, not a thrown exception, when Stripe itself fails', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness(from);
    const createSession = vi.fn().mockRejectedValue(new Error('stripe down'));
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    const result = await startCheckout('biz-1');

    expect(result.status).toBe('error');
  });
});

describe('openCustomerPortal — authorization', () => {
  it('rejects an unauthenticated caller', async () => {
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: false,
      error: SESSION_EXPIRED_MESSAGE
    });

    const result = await openCustomerPortal('biz-1');

    expect(result).toEqual({ status: 'error', error: SESSION_EXPIRED_MESSAGE });
  });

  it('rejects a cross-business id', async () => {
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: false,
      error: NO_BUSINESS_ACCESS_MESSAGE
    });

    const result = await openCustomerPortal('business-someone-else-owns');

    expect(result).toEqual({ status: 'error', error: NO_BUSINESS_ACCESS_MESSAGE });
  });
});

describe('openCustomerPortal — behavior', () => {
  it('returns not_configured when Stripe is not configured', async () => {
    const from = vi.fn();
    mockVerifiedBusiness(from);
    getStripeClient.mockReturnValue(null);

    const result = await openCustomerPortal('biz-1');

    expect(result).toEqual({ status: 'not_configured' });
  });

  it('returns no_customer when the business has never had a Stripe customer', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness(from);
    const createPortalSession = vi.fn();
    getStripeClient.mockReturnValue({
      billingPortal: { sessions: { create: createPortalSession } }
    });

    const result = await openCustomerPortal('biz-1');

    expect(result).toEqual({ status: 'no_customer' });
    expect(createPortalSession).not.toHaveBeenCalled();
  });

  it('creates a portal session for this business’s own customer id and a safe return URL', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: { stripe_customer_id: 'cus_own' } }));
    mockVerifiedBusiness(from);
    const createPortalSession = vi
      .fn()
      .mockResolvedValue({ url: 'https://billing.stripe.com/session_xyz' });
    getStripeClient.mockReturnValue({
      billingPortal: { sessions: { create: createPortalSession } }
    });

    const result = await openCustomerPortal('biz-1');

    expect(result).toEqual({ status: 'ok', url: 'https://billing.stripe.com/session_xyz' });
    expect(createPortalSession).toHaveBeenCalledWith({
      customer: 'cus_own',
      return_url: `${TEST_SITE_URL}/dashboard/billing`
    });
  });
});

describe('fetchBillingStatus', () => {
  it('propagates the authorization failure instead of querying anything', async () => {
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: false,
      error: SESSION_EXPIRED_MESSAGE
    });

    await expect(fetchBillingStatus('biz-1')).rejects.toThrow(SESSION_EXPIRED_MESSAGE);
  });

  it('returns not_configured without querying business_subscriptions when Stripe is not configured', async () => {
    const from = vi.fn();
    mockVerifiedBusiness(from);
    isStripeConfigured.mockReturnValue(false);

    const result = await fetchBillingStatus('biz-1');

    expect(result).toEqual({ status: 'not_configured' });
    expect(from).not.toHaveBeenCalled();
  });

  it('returns subscription: null for a business that has never subscribed — not an error', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null, error: null }));
    mockVerifiedBusiness(from);
    getStripeClient.mockReturnValue(null);

    const result = await fetchBillingStatus('biz-1');

    expect(result).toEqual({ status: 'ok', plan: null, subscription: null });
  });

  it('maps an existing subscription row without ever including the raw Stripe customer/subscription id', async () => {
    const row = {
      status: 'trialing',
      trial_start: '2026-01-01T00:00:00Z',
      trial_end: '2026-01-15T00:00:00Z',
      current_period_start: '2026-01-01T00:00:00Z',
      current_period_end: '2026-02-01T00:00:00Z',
      cancel_at_period_end: false,
      stripe_customer_id: 'cus_secret_value'
    };
    const from = vi.fn().mockReturnValueOnce(chainable({ data: row, error: null }));
    mockVerifiedBusiness(from);
    getStripeClient.mockReturnValue(null);

    const result = await fetchBillingStatus('biz-1');

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.subscription).toEqual({
        status: 'trialing',
        trialEnd: '2026-01-15T00:00:00Z',
        currentPeriodEnd: '2026-02-01T00:00:00Z',
        cancelAtPeriodEnd: false,
        hasStripeCustomer: true
      });
      expect(JSON.stringify(result.subscription)).not.toContain('cus_secret_value');
    }
  });

  it('fetches the live plan price/currency from Stripe rather than any hardcoded value', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null, error: null }));
    mockVerifiedBusiness(from);
    const retrievePrice = vi.fn().mockResolvedValue({
      unit_amount: 2900,
      currency: 'usd',
      recurring: { interval: 'month' },
      product: { name: 'Pro plan', deleted: false }
    });
    getStripeClient.mockReturnValue({ prices: { retrieve: retrievePrice } });

    const result = await fetchBillingStatus('biz-1');

    expect(retrievePrice).toHaveBeenCalledWith('price_123', { expand: ['product'] });
    expect(result).toEqual({
      status: 'ok',
      plan: { productName: 'Pro plan', unitAmount: 2900, currency: 'usd', interval: 'month' },
      subscription: null
    });
  });

  it('degrades gracefully to plan: null instead of failing the whole page when the Stripe price fetch fails', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null, error: null }));
    mockVerifiedBusiness(from);
    const retrievePrice = vi.fn().mockRejectedValue(new Error('stripe unavailable'));
    getStripeClient.mockReturnValue({ prices: { retrieve: retrievePrice } });

    const result = await fetchBillingStatus('biz-1');

    expect(result).toEqual({ status: 'ok', plan: null, subscription: null });
  });

  it('reports a generic error, not a raw DB error, on a query failure', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: null, error: { message: 'db down' } }));
    mockVerifiedBusiness(from);
    getStripeClient.mockReturnValue(null);

    await expect(fetchBillingStatus('biz-1')).rejects.toThrow('Something went wrong');
  });
});
