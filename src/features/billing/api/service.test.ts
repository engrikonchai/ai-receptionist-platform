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
const createSupabaseServiceRoleClient = vi.fn();
const claimCheckoutAttempt = vi.fn();
const recordCheckoutSession = vi.fn();

vi.mock('@/lib/stripe/client', () => ({
  getStripeClient: (...args: unknown[]) => getStripeClient(...args),
  getStripePriceId: (...args: unknown[]) => getStripePriceId(...args),
  isStripeConfigured: (...args: unknown[]) => isStripeConfigured(...args)
}));

vi.mock('@/lib/site-url', () => ({
  getSiteUrl: (...args: unknown[]) => getSiteUrl(...args)
}));

vi.mock('@/lib/supabase/service-role', () => ({
  createSupabaseServiceRoleClient: (...args: unknown[]) => createSupabaseServiceRoleClient(...args)
}));

vi.mock('./checkout-attempts', () => ({
  claimCheckoutAttempt: (...args: unknown[]) => claimCheckoutAttempt(...args),
  recordCheckoutSession: (...args: unknown[]) => recordCheckoutSession(...args)
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

function mockVerifiedBusiness(businessId = VERIFIED_BUSINESS_ID) {
  vi.mocked(verifyActiveBusiness).mockResolvedValue({
    ok: true,
    ctx: { supabase: {} as unknown as SupabaseClient, user: stubUser, businessId }
  });
}

const TEST_SITE_URL = 'https://app.example.com';
const TEST_EXPIRES_AT = new Date('2026-01-01T00:31:00.000Z');

function newClaim(
  overrides: Partial<{ attemptId: string; generation: number; expiresAt: Date }> = {}
) {
  return {
    kind: 'new' as const,
    attemptId: 'attempt-1',
    generation: 1,
    expiresAt: TEST_EXPIRES_AT,
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSiteUrl.mockReturnValue(TEST_SITE_URL);
  isStripeConfigured.mockReturnValue(true);
  getStripePriceId.mockReturnValue('price_123');
  // Default: claim always wins outright (no concurrent attempt in play)
  // — individual tests override this to exercise the other claim kinds.
  claimCheckoutAttempt.mockResolvedValue(newClaim());
  recordCheckoutSession.mockResolvedValue({ ok: true });
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
    expect(createSupabaseServiceRoleClient).not.toHaveBeenCalled();
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
    mockVerifiedBusiness();
    getStripeClient.mockReturnValue(null);

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'not_configured' });
    expect(createSupabaseServiceRoleClient).not.toHaveBeenCalled();
  });

  it('returns not_configured when no price id is configured', async () => {
    mockVerifiedBusiness();
    getStripePriceId.mockReturnValue(null);
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: vi.fn() } } });

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'not_configured' });
  });

  it('returns not_configured when the service-role client is unavailable', async () => {
    mockVerifiedBusiness();
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: vi.fn() } } });
    createSupabaseServiceRoleClient.mockReturnValue(null);

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'not_configured' });
  });
});

describe('startCheckout — duplicate prevention and customer reuse', () => {
  it('refuses to start a second Checkout when the business already has active access', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(
        chainable({ data: { status: 'active', stripe_customer_id: 'cus_1', trial_used_at: null } })
      );
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const createSession = vi.fn();
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'already_subscribed' });
    expect(createSession).not.toHaveBeenCalled();
    expect(claimCheckoutAttempt).not.toHaveBeenCalled();
  });

  it('refuses to start a second Checkout while trialing', async () => {
    const from = vi.fn().mockReturnValueOnce(
      chainable({
        data: { status: 'trialing', stripe_customer_id: 'cus_1', trial_used_at: '2026-01-01' }
      })
    );
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const createSession = vi.fn();
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'already_subscribed' });
  });

  it('allows a new Checkout for a past_due/canceled/incomplete business — recovery, not a duplicate', async () => {
    const from = vi.fn().mockReturnValueOnce(
      chainable({
        data: { status: 'past_due', stripe_customer_id: 'cus_1', trial_used_at: '2026-01-01' }
      })
    );
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const createSession = vi
      .fn()
      .mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/session_abc' });
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'ok', url: 'https://checkout.stripe.com/session_abc' });
    expect(createSession).toHaveBeenCalled();
  });

  it('reuses an existing Stripe customer id instead of letting Stripe create a new one', async () => {
    const from = vi.fn().mockReturnValueOnce(
      chainable({
        data: {
          status: 'canceled',
          stripe_customer_id: 'cus_existing',
          trial_used_at: '2026-01-01'
        }
      })
    );
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const createSession = vi
      .fn()
      .mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/x' });
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    await startCheckout('biz-1');

    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_existing' }),
      expect.objectContaining({ idempotencyKey: 'attempt-1' })
    );
  });

  it('omits the customer field entirely for a business with no Stripe customer yet — Stripe creates one', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const createSession = vi
      .fn()
      .mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/x' });
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    await startCheckout('biz-1');

    const callArgs = createSession.mock.calls[0][0];
    expect(callArgs.customer).toBeUndefined();
  });
});

describe('startCheckout — durable Checkout concurrency', () => {
  it('creates the Stripe Checkout Session using the claimed attempt id as the idempotency key, and the claimed expiresAt/generation', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    claimCheckoutAttempt.mockResolvedValue(
      newClaim({ attemptId: 'attempt-xyz', generation: 7, expiresAt: TEST_EXPIRES_AT })
    );
    const createSession = vi
      .fn()
      .mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/x' });
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    await startCheckout('biz-1');

    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        expires_at: Math.floor(TEST_EXPIRES_AT.getTime() / 1000),
        metadata: expect.objectContaining({ billing_generation: '7' })
      }),
      expect.objectContaining({ idempotencyKey: 'attempt-xyz' })
    );
    const callArgs = createSession.mock.calls[0][0];
    expect(callArgs.subscription_data.metadata).toEqual(
      expect.objectContaining({ billing_generation: '7' })
    );
    expect(recordCheckoutSession).toHaveBeenCalledWith(expect.anything(), 'attempt-xyz', 'cs_1');
  });

  it('resumes with the SAME attempt id/idempotency key when the claim says resume, exactly like a fresh claim', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    claimCheckoutAttempt.mockResolvedValue({
      kind: 'resume',
      attemptId: 'attempt-recovered',
      generation: 3,
      expiresAt: TEST_EXPIRES_AT
    });
    const createSession = vi
      .fn()
      .mockResolvedValue({ id: 'cs_recovered', url: 'https://checkout.stripe.com/recovered' });
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    const result = await startCheckout('biz-1');

    expect(createSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ idempotencyKey: 'attempt-recovered' })
    );
    expect(result).toEqual({ status: 'ok', url: 'https://checkout.stripe.com/recovered' });
  });

  it('never generates a new idempotency key on a resume — it always reuses the claimed attemptId', async () => {
    const from = vi.fn().mockReturnValue(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    claimCheckoutAttempt.mockResolvedValueOnce(newClaim({ attemptId: 'attempt-same' }));
    claimCheckoutAttempt.mockResolvedValueOnce({
      kind: 'resume',
      attemptId: 'attempt-same',
      generation: 1,
      expiresAt: TEST_EXPIRES_AT
    });
    const createSession = vi
      .fn()
      .mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/x' });
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    await startCheckout('biz-1');
    await startCheckout('biz-1');

    const keys = createSession.mock.calls.map((call) => call[1].idempotencyKey);
    expect(keys).toEqual(['attempt-same', 'attempt-same']);
  });

  it('reuses a concurrently-created Checkout Session instead of ever calling Stripe again', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    claimCheckoutAttempt.mockResolvedValue({
      kind: 'reuse',
      url: 'https://checkout.stripe.com/reused'
    });
    const createSession = vi.fn();
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'ok', url: 'https://checkout.stripe.com/reused' });
    expect(createSession).not.toHaveBeenCalled();
  });

  it('returns already_subscribed when the claim itself just synchronized a completed session', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    claimCheckoutAttempt.mockResolvedValue({ kind: 'already_subscribed' });
    const createSession = vi.fn();
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'already_subscribed' });
    expect(createSession).not.toHaveBeenCalled();
  });

  it('returns processing, never a new Checkout, when a completed session exists but synchronization has not finished', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    claimCheckoutAttempt.mockResolvedValue({ kind: 'processing' });
    const createSession = vi.fn();
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'processing' });
    expect(createSession).not.toHaveBeenCalled();
  });

  it('reports a generic, retryable error instead of racing a second session when the claim says retry', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    claimCheckoutAttempt.mockResolvedValue({ kind: 'retry' });
    const createSession = vi.fn();
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    const result = await startCheckout('biz-1');

    expect(result.status).toBe('error');
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe('startCheckout — recoverable session recording', () => {
  it('still returns the valid Checkout URL to this caller even when recordCheckoutSession itself fails', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const createSession = vi
      .fn()
      .mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/x' });
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });
    recordCheckoutSession.mockResolvedValue({ ok: false, reason: 'db_error' });

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'ok', url: 'https://checkout.stripe.com/x' });
  });

  it('a subsequent retry recovers the exact same Stripe Session via the same idempotency key after a recording failure, never a second session', async () => {
    const from = vi.fn().mockReturnValue(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);

    // First call: Stripe succeeds, but the DB write fails — the caller
    // still gets the real, valid session url.
    claimCheckoutAttempt.mockResolvedValueOnce(newClaim({ attemptId: 'attempt-1' }));
    recordCheckoutSession.mockResolvedValueOnce({ ok: false, reason: 'db_error' });
    // A real Stripe idempotency key returns the SAME session object for
    // a repeated call with the same key — simulated here directly,
    // since checkout-attempts.ts (not this test) is what discovers the
    // pending, no-session-id-recorded row and decides to resume.
    const createSession = vi
      .fn()
      .mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/x' });
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    const first = await startCheckout('biz-1');

    // Retry: claimCheckoutAttempt (real module, mocked here) is what
    // would discover the still-unrecorded attempt and return `resume`
    // with the SAME attemptId — recording succeeds this time.
    claimCheckoutAttempt.mockResolvedValueOnce({
      kind: 'resume',
      attemptId: 'attempt-1',
      generation: 1,
      expiresAt: TEST_EXPIRES_AT
    });
    recordCheckoutSession.mockResolvedValueOnce({ ok: true });

    const second = await startCheckout('biz-1');

    expect(first).toEqual({ status: 'ok', url: 'https://checkout.stripe.com/x' });
    expect(second).toEqual({ status: 'ok', url: 'https://checkout.stripe.com/x' });
    // Same idempotency key both times — never a freshly-minted one.
    const keys = createSession.mock.calls.map((call) => call[1].idempotencyKey);
    expect(keys).toEqual(['attempt-1', 'attempt-1']);
  });
});

describe('startCheckout — one free trial per business', () => {
  it('grants the 14-day trial on a business’s first-ever Checkout', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const createSession = vi
      .fn()
      .mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/x' });
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    await startCheckout('biz-1');

    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription_data: expect.objectContaining({ trial_period_days: 14 })
      }),
      expect.anything()
    );
  });

  it('never grants a second trial on a canceled-then-resubscribing business', async () => {
    const from = vi.fn().mockReturnValueOnce(
      chainable({
        data: {
          status: 'canceled',
          stripe_customer_id: 'cus_1',
          trial_used_at: '2026-01-01T00:00:00Z'
        }
      })
    );
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const createSession = vi
      .fn()
      .mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/x' });
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    await startCheckout('biz-1');

    const callArgs = createSession.mock.calls[0][0];
    expect(callArgs.subscription_data.trial_period_days).toBeUndefined();
  });

  it('never grants a trial to a business whose only prior Checkout was abandoned (trial_used_at only set by the webhook, never by startCheckout itself)', async () => {
    // An abandoned Checkout means the webhook never fired, so
    // trial_used_at is still null on file — this business remains
    // trial-eligible, and startCheckout() itself never writes
    // trial_used_at anywhere (only the webhook's sync does).
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const createSession = vi
      .fn()
      .mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/x' });
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    await startCheckout('biz-1');

    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription_data: expect.objectContaining({ trial_period_days: 14 })
      }),
      expect.anything()
    );
    // startCheckout() itself never touches business_subscriptions.trial_used_at.
    expect(from).not.toHaveBeenCalledWith('business_subscriptions', expect.anything());
  });

  it('never creates two trials for two concurrent Checkout attempts on the same business', async () => {
    const from = vi.fn().mockReturnValue(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const createSession = vi
      .fn()
      .mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/x' });
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    // First call wins the claim and creates the (trial) session.
    claimCheckoutAttempt.mockResolvedValueOnce(newClaim());
    await startCheckout('biz-1');

    // A concurrent/retried call reuses that same session instead of
    // creating a second one (and therefore a second trial).
    claimCheckoutAttempt.mockResolvedValueOnce({
      kind: 'reuse',
      url: 'https://checkout.stripe.com/x'
    });
    await startCheckout('biz-1');

    expect(createSession).toHaveBeenCalledTimes(1);
  });
});

describe('startCheckout — session configuration', () => {
  it('creates a subscription-mode session with the configured price', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const createSession = vi
      .fn()
      .mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/x' });
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    await startCheckout('biz-1');

    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        line_items: [{ price: 'price_123', quantity: 1 }]
      }),
      expect.anything()
    );
  });

  it('attaches the verified business id as trusted metadata on both the session and the subscription — never anything the browser supplied', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness('biz-verified');
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const createSession = vi
      .fn()
      .mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/x' });
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    await startCheckout('biz-verified');

    const callArgs = createSession.mock.calls[0][0];
    expect(callArgs.metadata).toEqual({
      business_id: 'biz-verified',
      billing_generation: String(newClaim().generation)
    });
    expect(callArgs.subscription_data.metadata).toEqual({
      business_id: 'biz-verified',
      billing_generation: String(newClaim().generation)
    });
  });

  it('builds success/cancel URLs from NEXT_PUBLIC_SITE_URL only — never a request Host header (this function never even receives a Request)', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const createSession = vi
      .fn()
      .mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/x' });
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: createSession } } });

    await startCheckout('biz-1');

    const callArgs = createSession.mock.calls[0][0];
    expect(callArgs.success_url).toBe(`${TEST_SITE_URL}/dashboard/billing?checkout=success`);
    expect(callArgs.cancel_url).toBe(`${TEST_SITE_URL}/dashboard/billing?checkout=canceled`);
    expect(getSiteUrl).toHaveBeenCalled();
  });

  it('reports a generic error, not a thrown exception, when Stripe itself fails', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
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
    mockVerifiedBusiness();
    getStripeClient.mockReturnValue(null);

    const result = await openCustomerPortal('biz-1');

    expect(result).toEqual({ status: 'not_configured' });
  });

  it('returns not_configured when the service-role client is unavailable', async () => {
    mockVerifiedBusiness();
    getStripeClient.mockReturnValue({ billingPortal: { sessions: { create: vi.fn() } } });
    createSupabaseServiceRoleClient.mockReturnValue(null);

    const result = await openCustomerPortal('biz-1');

    expect(result).toEqual({ status: 'not_configured' });
  });

  it('returns no_customer when the business has never had a Stripe customer', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const createPortalSession = vi.fn();
    getStripeClient.mockReturnValue({
      billingPortal: { sessions: { create: createPortalSession } }
    });

    const result = await openCustomerPortal('biz-1');

    expect(result).toEqual({ status: 'no_customer' });
    expect(createPortalSession).not.toHaveBeenCalled();
  });

  it('creates a portal session for this business’s own customer id and a safe return URL, read via the service-role client', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: { stripe_customer_id: 'cus_own' } }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
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
    expect(from).toHaveBeenCalledWith('business_subscriptions');
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
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: true,
      ctx: { supabase: { from } as unknown as SupabaseClient, user: stubUser, businessId: 'biz-1' }
    });
    isStripeConfigured.mockReturnValue(false);

    const result = await fetchBillingStatus('biz-1');

    expect(result).toEqual({ status: 'not_configured' });
    expect(from).not.toHaveBeenCalled();
  });

  it('returns subscription: null for a business that has never subscribed — not an error', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null, error: null }));
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: true,
      ctx: { supabase: { from } as unknown as SupabaseClient, user: stubUser, businessId: 'biz-1' }
    });
    getStripeClient.mockReturnValue(null);

    const result = await fetchBillingStatus('biz-1');

    expect(result).toEqual({ status: 'ok', plan: null, subscription: null });
  });

  it('reads only the authenticated-safe columns — never stripe_customer_id or stripe_subscription_id', async () => {
    const select = vi.fn().mockReturnValue(chainable({ data: null, error: null }));
    const from = vi.fn().mockReturnValue({ select });
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: true,
      ctx: { supabase: { from } as unknown as SupabaseClient, user: stubUser, businessId: 'biz-1' }
    });
    getStripeClient.mockReturnValue(null);

    await fetchBillingStatus('biz-1');

    const selectArg = select.mock.calls[0]?.[0] as string;
    expect(selectArg).not.toMatch(/stripe_customer_id/);
    expect(selectArg).not.toMatch(/stripe_subscription_id/);
    expect(selectArg).toContain('has_stripe_customer');
  });

  it('maps an existing subscription row using has_stripe_customer, without ever selecting the raw Stripe customer/subscription id', async () => {
    const row = {
      status: 'trialing',
      trial_start: '2026-01-01T00:00:00Z',
      trial_end: '2026-01-15T00:00:00Z',
      current_period_start: '2026-01-01T00:00:00Z',
      current_period_end: '2026-02-01T00:00:00Z',
      cancel_at_period_end: false,
      has_stripe_customer: true
    };
    const from = vi.fn().mockReturnValueOnce(chainable({ data: row, error: null }));
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: true,
      ctx: { supabase: { from } as unknown as SupabaseClient, user: stubUser, businessId: 'biz-1' }
    });
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
      expect(JSON.stringify(result.subscription)).not.toContain('cus_');
    }
  });

  it('fetches the live plan price/currency from Stripe rather than any hardcoded value', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null, error: null }));
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: true,
      ctx: { supabase: { from } as unknown as SupabaseClient, user: stubUser, businessId: 'biz-1' }
    });
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
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: true,
      ctx: { supabase: { from } as unknown as SupabaseClient, user: stubUser, businessId: 'biz-1' }
    });
    const retrievePrice = vi.fn().mockRejectedValue(new Error('stripe unavailable'));
    getStripeClient.mockReturnValue({ prices: { retrieve: retrievePrice } });

    const result = await fetchBillingStatus('biz-1');

    expect(result).toEqual({ status: 'ok', plan: null, subscription: null });
  });

  it('reports a generic error, not a raw DB error, on a query failure', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: null, error: { message: 'db down' } }));
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: true,
      ctx: { supabase: { from } as unknown as SupabaseClient, user: stubUser, businessId: 'biz-1' }
    });
    getStripeClient.mockReturnValue(null);

    await expect(fetchBillingStatus('biz-1')).rejects.toThrow('Something went wrong');
  });
});
