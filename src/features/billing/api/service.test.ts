import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { verifyActiveBusiness } from './authorize';
import {
  GENERIC_BILLING_ERROR,
  SESSION_EXPIRED_MESSAGE,
  NO_BUSINESS_ACCESS_MESSAGE
} from './types';
import { fetchBillingStatus, openCustomerPortal, startCheckout } from './service';
import { CHECKOUT_DIAGNOSTIC_LOG_PREFIX } from './diagnostics';

vi.mock('./authorize', () => ({
  verifyActiveBusiness: vi.fn()
}));

const getPaddleClient = vi.fn();
const getPaddlePriceId = vi.fn();
const getPaddleEnvironment = vi.fn();
const getSiteUrl = vi.fn();
const createSupabaseServiceRoleClient = vi.fn();
const claimCheckoutAttempt = vi.fn();
const recordTransactionId = vi.fn();

vi.mock('@/lib/paddle/client', () => ({
  getPaddleClient: (...args: unknown[]) => getPaddleClient(...args),
  getPaddlePriceId: (...args: unknown[]) => getPaddlePriceId(...args),
  getPaddleEnvironment: (...args: unknown[]) => getPaddleEnvironment(...args)
}));

vi.mock('@/lib/site-url', () => ({
  getSiteUrl: (...args: unknown[]) => getSiteUrl(...args)
}));

vi.mock('@/lib/supabase/service-role', () => ({
  createSupabaseServiceRoleClient: (...args: unknown[]) => createSupabaseServiceRoleClient(...args)
}));

vi.mock('./checkout-attempts', () => ({
  claimCheckoutAttempt: (...args: unknown[]) => claimCheckoutAttempt(...args),
  recordTransactionId: (...args: unknown[]) => recordTransactionId(...args)
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

/** An empty `CustomerCollection`-like async iterable — no matching customer found. */
function emptyCustomerList() {
  return { [Symbol.asyncIterator]: async function* () {} };
}

const stubUser = { id: 'user-1', email: 'owner@example.com' } as unknown as User;
const VERIFIED_BUSINESS_ID = 'biz-1';

function mockVerifiedBusiness(businessId = VERIFIED_BUSINESS_ID) {
  vi.mocked(verifyActiveBusiness).mockResolvedValue({
    ok: true,
    ctx: { supabase: {} as unknown as SupabaseClient, user: stubUser, businessId }
  });
}

function newClaim(overrides: Partial<{ attemptId: string; generation: number }> = {}) {
  return { kind: 'new' as const, attemptId: 'attempt-1', generation: 1, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  getPaddleEnvironment.mockReturnValue('sandbox');
  getPaddlePriceId.mockReturnValue('pri_123');
  claimCheckoutAttempt.mockResolvedValue(newClaim());
  recordTransactionId.mockResolvedValue({ ok: true });
});

describe('startCheckout — authorization', () => {
  it('rejects an unauthenticated caller instead of ever calling Paddle', async () => {
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: false,
      error: SESSION_EXPIRED_MESSAGE
    });
    const create = vi.fn();
    getPaddleClient.mockReturnValue({ transactions: { create } });

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'error', error: SESSION_EXPIRED_MESSAGE });
    expect(create).not.toHaveBeenCalled();
    expect(createSupabaseServiceRoleClient).not.toHaveBeenCalled();
  });

  it('rejects a business id that does not belong to the signed-in owner (cross-business)', async () => {
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: false,
      error: NO_BUSINESS_ACCESS_MESSAGE
    });
    const create = vi.fn();
    getPaddleClient.mockReturnValue({ transactions: { create } });

    const result = await startCheckout('business-someone-else-owns');

    expect(result).toEqual({ status: 'error', error: NO_BUSINESS_ACCESS_MESSAGE });
    expect(create).not.toHaveBeenCalled();
  });
});

describe('startCheckout — configuration', () => {
  it('returns not_configured when Paddle is not configured', async () => {
    mockVerifiedBusiness();
    getPaddleClient.mockReturnValue(null);

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'not_configured' });
    expect(createSupabaseServiceRoleClient).not.toHaveBeenCalled();
  });

  it('returns not_configured when no price id is configured', async () => {
    mockVerifiedBusiness();
    getPaddlePriceId.mockReturnValue(null);
    getPaddleClient.mockReturnValue({ transactions: { create: vi.fn() } });

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'not_configured' });
  });

  it('returns not_configured when the service-role client is unavailable', async () => {
    mockVerifiedBusiness();
    getPaddleClient.mockReturnValue({ transactions: { create: vi.fn() } });
    createSupabaseServiceRoleClient.mockReturnValue(null);

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'not_configured' });
  });
});

describe('startCheckout — duplicate prevention and customer reuse', () => {
  it('refuses to start a second Checkout when the business already has active access', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: { status: 'active', paddle_customer_id: 'ctm_1' } }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const create = vi.fn();
    getPaddleClient.mockReturnValue({ transactions: { create } });

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'already_subscribed' });
    expect(create).not.toHaveBeenCalled();
    expect(claimCheckoutAttempt).not.toHaveBeenCalled();
  });

  it('refuses to start a second Checkout while trialing', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(
        chainable({ data: { status: 'trialing', paddle_customer_id: 'ctm_1' } })
      );
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const create = vi.fn();
    getPaddleClient.mockReturnValue({ transactions: { create } });

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'already_subscribed' });
  });

  it('allows a new Checkout for a past_due/canceled/paused business — recovery, not a duplicate', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(
        chainable({ data: { status: 'past_due', paddle_customer_id: 'ctm_1' } })
      );
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const create = vi.fn().mockResolvedValue({ id: 'txn_1' });
    getPaddleClient.mockReturnValue({
      transactions: { create },
      customers: { list: emptyCustomerList, create: vi.fn() }
    });

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'ok', transactionId: 'txn_1' });
    expect(create).toHaveBeenCalled();
  });

  it('reuses an existing Paddle customer id instead of letting Paddle create a new one', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(
        chainable({ data: { status: 'canceled', paddle_customer_id: 'ctm_existing' } })
      );
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const create = vi.fn().mockResolvedValue({ id: 'txn_1' });
    const customersCreate = vi.fn();
    getPaddleClient.mockReturnValue({
      transactions: { create },
      customers: { list: vi.fn(), create: customersCreate }
    });

    await startCheckout('biz-1');

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'ctm_existing' }));
    expect(customersCreate).not.toHaveBeenCalled();
  });

  it('looks up an existing Paddle customer by the owner’s email before creating a new one, for a business with none on file yet', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const create = vi.fn().mockResolvedValue({ id: 'txn_1' });
    const list = vi.fn().mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { id: 'ctm_found' };
      }
    });
    const customersCreate = vi.fn();
    getPaddleClient.mockReturnValue({
      transactions: { create },
      customers: { list, create: customersCreate }
    });

    await startCheckout('biz-1');

    expect(list).toHaveBeenCalledWith(expect.objectContaining({ email: ['owner@example.com'] }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'ctm_found' }));
    expect(customersCreate).not.toHaveBeenCalled();
  });

  it('creates a brand-new Paddle customer only when none exists on file or by email lookup', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const create = vi.fn().mockResolvedValue({ id: 'txn_1' });
    const list = vi.fn().mockReturnValue({
      [Symbol.asyncIterator]: async function* () {}
    });
    const customersCreate = vi.fn().mockResolvedValue({ id: 'ctm_new' });
    getPaddleClient.mockReturnValue({
      transactions: { create },
      customers: { list, create: customersCreate }
    });

    await startCheckout('biz-1');

    expect(customersCreate).toHaveBeenCalledWith({ email: 'owner@example.com' });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'ctm_new' }));
  });
});

describe('startCheckout — durable Checkout concurrency', () => {
  it('creates the Paddle transaction only for the winning "new" claim', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    claimCheckoutAttempt.mockResolvedValue(newClaim({ attemptId: 'attempt-xyz', generation: 7 }));
    const create = vi.fn().mockResolvedValue({ id: 'txn_1' });
    const list = vi.fn().mockReturnValue({ [Symbol.asyncIterator]: async function* () {} });
    getPaddleClient.mockReturnValue({
      transactions: { create },
      customers: { list, create: vi.fn().mockResolvedValue({ id: 'ctm_new' }) }
    });

    await startCheckout('biz-1');

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        customData: { business_id: 'biz-1', billing_generation: 7 }
      })
    );
    expect(recordTransactionId).toHaveBeenCalledWith(expect.anything(), 'attempt-xyz', 'txn_1');
  });

  it('reuses a concurrently-claimed open transaction instead of ever calling Paddle again', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    claimCheckoutAttempt.mockResolvedValue({ kind: 'reuse', transactionId: 'txn_reused' });
    const create = vi.fn();
    getPaddleClient.mockReturnValue({ transactions: { create } });

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'ok', transactionId: 'txn_reused' });
    expect(create).not.toHaveBeenCalled();
  });

  it('returns already_subscribed when the claim itself just synchronized a completed transaction', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    claimCheckoutAttempt.mockResolvedValue({ kind: 'already_subscribed' });
    const create = vi.fn();
    getPaddleClient.mockReturnValue({ transactions: { create } });

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'already_subscribed' });
    expect(create).not.toHaveBeenCalled();
  });

  it('returns processing, never a new Checkout, when a succeeded transaction exists but synchronization has not finished', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    claimCheckoutAttempt.mockResolvedValue({ kind: 'processing' });
    const create = vi.fn();
    getPaddleClient.mockReturnValue({ transactions: { create } });

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'processing' });
    expect(create).not.toHaveBeenCalled();
  });

  it('reports a generic, retryable error instead of racing a second transaction when the claim says retry (no Paddle idempotency key exists to make a resume safe)', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    claimCheckoutAttempt.mockResolvedValue({ kind: 'retry' });
    const create = vi.fn();
    getPaddleClient.mockReturnValue({ transactions: { create } });

    const result = await startCheckout('biz-1');

    expect(result.status).toBe('error');
    expect(create).not.toHaveBeenCalled();
  });

  it('still returns the valid transaction id to this caller even when recordTransactionId itself fails', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const create = vi.fn().mockResolvedValue({ id: 'txn_1' });
    const list = vi.fn().mockReturnValue({ [Symbol.asyncIterator]: async function* () {} });
    getPaddleClient.mockReturnValue({
      transactions: { create },
      customers: { list, create: vi.fn().mockResolvedValue({ id: 'ctm_new' }) }
    });
    recordTransactionId.mockResolvedValue({ ok: false, reason: 'db_error' });

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'ok', transactionId: 'txn_1' });
  });
});

describe('startCheckout — never gates or requests a trial itself', () => {
  it('never passes any trial-related parameter to Paddle — trial eligibility is entirely Paddle’s own decision', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const create = vi.fn().mockResolvedValue({ id: 'txn_1' });
    const list = vi.fn().mockReturnValue({ [Symbol.asyncIterator]: async function* () {} });
    getPaddleClient.mockReturnValue({
      transactions: { create },
      customers: { list, create: vi.fn().mockResolvedValue({ id: 'ctm_new' }) }
    });

    await startCheckout('biz-1');

    const callArgs = create.mock.calls[0][0];
    expect(JSON.stringify(callArgs).toLowerCase()).not.toContain('trial');
  });

  it('never touches business_subscriptions.trial_used_at itself — only the webhook sync ever writes it', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const create = vi.fn().mockResolvedValue({ id: 'txn_1' });
    const list = vi.fn().mockReturnValue({ [Symbol.asyncIterator]: async function* () {} });
    getPaddleClient.mockReturnValue({
      transactions: { create },
      customers: { list, create: vi.fn().mockResolvedValue({ id: 'ctm_new' }) }
    });

    await startCheckout('biz-1');

    // The one and only business_subscriptions query in this whole call
    // is the initial read — startCheckout() never writes to it.
    expect(from).toHaveBeenCalledTimes(1);
  });
});

describe('startCheckout — session configuration', () => {
  it('creates a transaction with the configured price', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const create = vi.fn().mockResolvedValue({ id: 'txn_1' });
    const list = vi.fn().mockReturnValue({ [Symbol.asyncIterator]: async function* () {} });
    getPaddleClient.mockReturnValue({
      transactions: { create },
      customers: { list, create: vi.fn().mockResolvedValue({ id: 'ctm_new' }) }
    });

    await startCheckout('biz-1');

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ items: [{ priceId: 'pri_123', quantity: 1 }] })
    );
  });

  it('attaches the verified business id as trusted custom_data — never anything the browser supplied', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness('biz-verified');
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const create = vi.fn().mockResolvedValue({ id: 'txn_1' });
    const list = vi.fn().mockReturnValue({ [Symbol.asyncIterator]: async function* () {} });
    getPaddleClient.mockReturnValue({
      transactions: { create },
      customers: { list, create: vi.fn().mockResolvedValue({ id: 'ctm_new' }) }
    });

    await startCheckout('biz-verified');

    const callArgs = create.mock.calls[0][0];
    expect(callArgs.customData).toEqual({ business_id: 'biz-verified', billing_generation: 1 });
  });

  it('reports a generic error, not a thrown exception, when Paddle itself fails', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const create = vi.fn().mockRejectedValue(new Error('paddle down'));
    const list = vi.fn().mockReturnValue({ [Symbol.asyncIterator]: async function* () {} });
    getPaddleClient.mockReturnValue({
      transactions: { create },
      customers: { list, create: vi.fn().mockResolvedValue({ id: 'ctm_new' }) }
    });

    const result = await startCheckout('biz-1');

    expect(result.status).toBe('error');
  });

  it('never leaks the raw transaction beyond its id — the safe checkout response is only { status, transactionId }', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const create = vi
      .fn()
      .mockResolvedValue({ id: 'txn_1', customerId: 'ctm_secret', checkout: { url: 'internal' } });
    const list = vi.fn().mockReturnValue({ [Symbol.asyncIterator]: async function* () {} });
    getPaddleClient.mockReturnValue({
      transactions: { create },
      customers: { list, create: vi.fn().mockResolvedValue({ id: 'ctm_new' }) }
    });

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'ok', transactionId: 'txn_1' });
    expect(Object.keys(result)).toEqual(['status', 'transactionId']);
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
  it('returns not_configured when Paddle is not configured', async () => {
    mockVerifiedBusiness();
    getPaddleClient.mockReturnValue(null);

    const result = await openCustomerPortal('biz-1');

    expect(result).toEqual({ status: 'not_configured' });
  });

  it('returns not_configured when the service-role client is unavailable', async () => {
    mockVerifiedBusiness();
    getPaddleClient.mockReturnValue({ customerPortalSessions: { create: vi.fn() } });
    createSupabaseServiceRoleClient.mockReturnValue(null);

    const result = await openCustomerPortal('biz-1');

    expect(result).toEqual({ status: 'not_configured' });
  });

  it('returns no_customer when the business has never had a Paddle customer', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const createPortalSession = vi.fn();
    getPaddleClient.mockReturnValue({ customerPortalSessions: { create: createPortalSession } });

    const result = await openCustomerPortal('biz-1');

    expect(result).toEqual({ status: 'no_customer' });
    expect(createPortalSession).not.toHaveBeenCalled();
  });

  it('creates a portal session for this business’s own customer id, read via the service-role client', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(
        chainable({ data: { paddle_customer_id: 'ctm_own', paddle_subscription_id: 'sub_own' } })
      );
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const createPortalSession = vi.fn().mockResolvedValue({
      urls: { general: { overview: 'https://sandbox-customer-portal.paddle.com/x' } }
    });
    getPaddleClient.mockReturnValue({ customerPortalSessions: { create: createPortalSession } });

    const result = await openCustomerPortal('biz-1');

    expect(result).toEqual({
      status: 'ok',
      url: 'https://sandbox-customer-portal.paddle.com/x'
    });
    expect(createPortalSession).toHaveBeenCalledWith('ctm_own', ['sub_own']);
    expect(from).toHaveBeenCalledWith('business_subscriptions');
  });

  it('passes an empty subscription list when the business has a customer but no subscription id yet', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(
        chainable({ data: { paddle_customer_id: 'ctm_own', paddle_subscription_id: null } })
      );
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const createPortalSession = vi.fn().mockResolvedValue({
      urls: { general: { overview: 'https://sandbox-customer-portal.paddle.com/x' } }
    });
    getPaddleClient.mockReturnValue({ customerPortalSessions: { create: createPortalSession } });

    await openCustomerPortal('biz-1');

    expect(createPortalSession).toHaveBeenCalledWith('ctm_own', []);
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

  it('returns not_configured without querying business_subscriptions when PADDLE_ENVIRONMENT is invalid/unset', async () => {
    const from = vi.fn();
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: true,
      ctx: { supabase: { from } as unknown as SupabaseClient, user: stubUser, businessId: 'biz-1' }
    });
    getPaddleEnvironment.mockReturnValue(null);

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
    getPaddleClient.mockReturnValue(null);

    const result = await fetchBillingStatus('biz-1');

    expect(result).toEqual({
      status: 'ok',
      plan: null,
      subscription: null,
      environment: 'sandbox'
    });
  });

  it('reads only the authenticated-safe columns — never paddle_customer_id, paddle_subscription_id, or paddle_transaction_id', async () => {
    const select = vi.fn().mockReturnValue(chainable({ data: null, error: null }));
    const from = vi.fn().mockReturnValue({ select });
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: true,
      ctx: { supabase: { from } as unknown as SupabaseClient, user: stubUser, businessId: 'biz-1' }
    });
    getPaddleClient.mockReturnValue(null);

    await fetchBillingStatus('biz-1');

    const selectArg = select.mock.calls[0]?.[0] as string;
    expect(selectArg).not.toMatch(/paddle_customer_id/);
    expect(selectArg).not.toMatch(/paddle_subscription_id/);
    expect(selectArg).not.toMatch(/paddle_transaction_id/);
    expect(selectArg).toContain('has_paddle_customer');
  });

  it('maps an existing subscription row using has_paddle_customer, without ever selecting the raw Paddle customer/subscription id', async () => {
    const row = {
      status: 'trialing',
      trial_start: '2026-01-01T00:00:00Z',
      trial_end: '2026-01-15T00:00:00Z',
      current_period_start: '2026-01-01T00:00:00Z',
      current_period_end: '2026-02-01T00:00:00Z',
      cancel_at_period_end: false,
      has_paddle_customer: true
    };
    const from = vi.fn().mockReturnValueOnce(chainable({ data: row, error: null }));
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: true,
      ctx: { supabase: { from } as unknown as SupabaseClient, user: stubUser, businessId: 'biz-1' }
    });
    getPaddleClient.mockReturnValue(null);

    const result = await fetchBillingStatus('biz-1');

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.subscription).toEqual({
        status: 'trialing',
        trialEnd: '2026-01-15T00:00:00Z',
        currentPeriodEnd: '2026-02-01T00:00:00Z',
        cancelAtPeriodEnd: false,
        hasPaddleCustomer: true
      });
      expect(JSON.stringify(result.subscription)).not.toContain('ctm_');
    }
  });

  it('fetches the live plan price/currency from Paddle rather than any hardcoded value', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null, error: null }));
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: true,
      ctx: { supabase: { from } as unknown as SupabaseClient, user: stubUser, businessId: 'biz-1' }
    });
    const getPrice = vi.fn().mockResolvedValue({
      description: 'Pro plan',
      unitPrice: { amount: '2900', currencyCode: 'USD' },
      billingCycle: { interval: 'month', frequency: 1 },
      product: { name: 'Pro plan' }
    });
    getPaddleClient.mockReturnValue({ prices: { get: getPrice } });

    const result = await fetchBillingStatus('biz-1');

    expect(getPrice).toHaveBeenCalledWith('pri_123', { include: ['product'] });
    expect(result).toEqual({
      status: 'ok',
      plan: { productName: 'Pro plan', unitAmount: 2900, currency: 'USD', interval: 'month' },
      subscription: null,
      environment: 'sandbox'
    });
  });

  it('degrades gracefully to plan: null instead of failing the whole page when the Paddle price fetch fails', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null, error: null }));
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: true,
      ctx: { supabase: { from } as unknown as SupabaseClient, user: stubUser, businessId: 'biz-1' }
    });
    const getPrice = vi.fn().mockRejectedValue(new Error('paddle unavailable'));
    getPaddleClient.mockReturnValue({ prices: { get: getPrice } });

    const result = await fetchBillingStatus('biz-1');

    expect(result).toEqual({
      status: 'ok',
      plan: null,
      subscription: null,
      environment: 'sandbox'
    });
  });

  it('reports a generic error, not a raw DB error, on a query failure', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: null, error: { message: 'db down' } }));
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: true,
      ctx: { supabase: { from } as unknown as SupabaseClient, user: stubUser, businessId: 'biz-1' }
    });
    getPaddleClient.mockReturnValue(null);

    await expect(fetchBillingStatus('biz-1')).rejects.toThrow('Something went wrong');
  });
});

describe('startCheckout — safe diagnostic logging', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  function loggedDiagnostics(): Array<Record<string, unknown>> {
    return consoleErrorSpy.mock.calls
      .filter((call: unknown[]) => call[0] === CHECKOUT_DIAGNOSTIC_LOG_PREFIX)
      .map((call: unknown[]) => JSON.parse(call[1] as string));
  }

  it('logs a safe diagnostic for a customer lookup/create failure, and still returns only the generic error', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const create = vi.fn();
    const list = vi.fn().mockImplementation(() => {
      throw new Error('paddle customers.list unavailable');
    });
    getPaddleClient.mockReturnValue({
      transactions: { create },
      customers: { list, create: vi.fn() }
    });

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'error', error: GENERIC_BILLING_ERROR });
    expect(create).not.toHaveBeenCalled();
    const diagnostics = loggedDiagnostics();
    expect(diagnostics).toEqual([{ stage: 'resolve_customer' }]);
  });

  it('logs a safe diagnostic for a transaction-creation failure, and still returns only the generic error', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const create = vi.fn().mockRejectedValue(new Error('paddle down'));
    const list = vi.fn().mockReturnValue({ [Symbol.asyncIterator]: async function* () {} });
    getPaddleClient.mockReturnValue({
      transactions: { create },
      customers: { list, create: vi.fn().mockResolvedValue({ id: 'ctm_new' }) }
    });

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'error', error: GENERIC_BILLING_ERROR });
    const diagnostics = loggedDiagnostics();
    expect(diagnostics).toEqual([{ stage: 'create_transaction' }]);
  });

  it('extracts the Paddle error code/type into the diagnostic when the SDK throws an ApiError', async () => {
    const { ApiError } = await import('@paddle/paddle-node-sdk');
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const create = vi.fn().mockRejectedValue(
      new ApiError(
        {
          type: 'request_error',
          code: 'invalid_amount',
          detail: 'The amount provided is invalid',
          documentation_url: 'https://developer.paddle.com/errors/invalid_amount',
          errors: undefined
        },
        null
      )
    );
    const list = vi.fn().mockReturnValue({ [Symbol.asyncIterator]: async function* () {} });
    getPaddleClient.mockReturnValue({
      transactions: { create },
      customers: { list, create: vi.fn().mockResolvedValue({ id: 'ctm_new' }) }
    });

    await startCheckout('biz-1');

    expect(loggedDiagnostics()).toEqual([
      {
        stage: 'create_transaction',
        paddleErrorCode: 'invalid_amount',
        paddleErrorType: 'request_error'
      }
    ]);
  });

  it('logs a safe diagnostic when recordTransactionId fails to persist, but still reports success to the caller — the Paddle transaction is real either way', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const create = vi.fn().mockResolvedValue({ id: 'txn_1' });
    const list = vi.fn().mockReturnValue({ [Symbol.asyncIterator]: async function* () {} });
    getPaddleClient.mockReturnValue({
      transactions: { create },
      customers: { list, create: vi.fn().mockResolvedValue({ id: 'ctm_new' }) }
    });
    recordTransactionId.mockResolvedValue({ ok: false, reason: '53300' });

    const result = await startCheckout('biz-1');

    expect(result).toEqual({ status: 'ok', transactionId: 'txn_1' });
    expect(loggedDiagnostics()).toEqual([
      { stage: 'record_transaction_id', supabaseErrorCode: '53300' }
    ]);
  });

  it('never logs the customer email, business id, or transaction id in any diagnostic it emits', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    mockVerifiedBusiness();
    createSupabaseServiceRoleClient.mockReturnValue({ from } as unknown as SupabaseClient);
    const create = vi
      .fn()
      .mockRejectedValue(new Error('paddle down, txn would have been txn_secret_123'));
    const list = vi.fn().mockImplementation(() => {
      throw new Error('lookup failed for owner@example.com');
    });
    getPaddleClient.mockReturnValue({
      transactions: { create },
      customers: { list, create: vi.fn() }
    });

    await startCheckout(VERIFIED_BUSINESS_ID);

    const allLoggedText = consoleErrorSpy.mock.calls
      .map((call: unknown[]) =>
        call.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ')
      )
      .join('\n');

    expect(allLoggedText).not.toContain('owner@example.com');
    expect(allLoggedText).not.toContain('txn_secret_123');
    expect(allLoggedText).not.toContain(VERIFIED_BUSINESS_ID);
  });
});
