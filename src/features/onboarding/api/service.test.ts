import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { verifyActiveBusiness } from './authorize';
import { GENERIC_SAVE_ERROR, SESSION_EXPIRED_MESSAGE } from './types';
import { markOnboardingCompleted, saveBusinessInfoStep } from './service';
import type { BusinessInfoStepValues } from '../schemas/onboarding';

vi.mock('./authorize', () => ({
  verifyActiveBusiness: vi.fn()
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn()
}));

/** A stand-in for Supabase's PostgREST query builder — see the identical helper in widget/knowledge's own service.test.ts. */
function chainable<T>(result: T) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (value: T) => void, reject?: (reason: unknown) => void) =>
            Promise.resolve(result).then(resolve, reject);
        }
        return () => proxy;
      }
    }
  );
  return proxy;
}

const stubUser = { id: 'user-1' } as unknown as User;
const VERIFIED_BUSINESS_ID = 'biz-verified';

function mockVerifiedBusiness(from: ReturnType<typeof vi.fn>, businessId = VERIFIED_BUSINESS_ID) {
  vi.mocked(verifyActiveBusiness).mockResolvedValue({
    ok: true,
    ctx: { supabase: { from } as unknown as SupabaseClient, user: stubUser, businessId }
  });
}

const validBusinessInfo: BusinessInfoStepValues = {
  businessName: 'Riviera Stay Apartments',
  businessType: 'apartment',
  location: 'Budva, Montenegro',
  websiteUrl: 'https://riviera-stay.example.com',
  defaultLanguage: 'en',
  supportedLanguages: ['en']
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('saveBusinessInfoStep', () => {
  it('propagates the authorization failure instead of writing anything', async () => {
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: false,
      error: SESSION_EXPIRED_MESSAGE
    });

    const result = await saveBusinessInfoStep('biz-1', validBusinessInfo);

    expect(result).toEqual({ success: false, error: SESSION_EXPIRED_MESSAGE });
  });

  it('rejects a business id that is not the caller’s own without writing anything', async () => {
    const from = vi.fn();
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: false,
      error: "We couldn't find that business, or you don't have access to it."
    });

    const result = await saveBusinessInfoStep('biz-someone-elses', validBusinessInfo);

    expect(result.success).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects an empty business name before writing anything', async () => {
    const from = vi.fn();
    mockVerifiedBusiness(from);

    const result = await saveBusinessInfoStep(VERIFIED_BUSINESS_ID, {
      ...validBusinessInfo,
      businessName: ''
    });

    expect(result.success).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it('updates the businesses row, scoped to the verified business id, and never sends websiteUrl to the database', async () => {
    const update = vi.fn().mockReturnValue(chainable({ error: null }));
    const from = vi.fn().mockReturnValue({ update });
    mockVerifiedBusiness(from);

    const result = await saveBusinessInfoStep(VERIFIED_BUSINESS_ID, validBusinessInfo);

    expect(result).toEqual({ success: true });
    expect(from).toHaveBeenCalledWith('businesses');
    const payload = update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      name: 'Riviera Stay Apartments',
      business_type: 'apartment',
      location: 'Budva, Montenegro',
      default_language: 'en',
      supported_languages: ['en']
    });
    expect(payload).not.toHaveProperty('websiteUrl');
    expect(payload).not.toHaveProperty('website_url');
  });

  it('returns a friendly error on a database failure, never a raw Supabase error', async () => {
    const update = vi.fn().mockReturnValue(chainable({ error: { message: 'db down' } }));
    const from = vi.fn().mockReturnValue({ update });
    mockVerifiedBusiness(from);

    const result = await saveBusinessInfoStep(VERIFIED_BUSINESS_ID, validBusinessInfo);

    expect(result).toEqual({ success: false, error: GENERIC_SAVE_ERROR });
  });

  it('is idempotent — submitting the same step twice just re-applies the same update, never inserts', async () => {
    const update = vi.fn().mockReturnValue(chainable({ error: null }));
    const from = vi.fn().mockReturnValue({ update });
    mockVerifiedBusiness(from);

    const first = await saveBusinessInfoStep(VERIFIED_BUSINESS_ID, validBusinessInfo);
    const second = await saveBusinessInfoStep(VERIFIED_BUSINESS_ID, validBusinessInfo);

    expect(first).toEqual({ success: true });
    expect(second).toEqual({ success: true });
    expect(update).toHaveBeenCalledTimes(2);
    expect(from).not.toHaveBeenCalledWith('businesses', 'insert');
  });
});

describe('markOnboardingCompleted', () => {
  it('propagates the authorization failure instead of writing anything', async () => {
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: false,
      error: SESSION_EXPIRED_MESSAGE
    });

    const result = await markOnboardingCompleted('biz-1');

    expect(result).toEqual({ success: false, error: SESSION_EXPIRED_MESSAGE });
  });

  it('sets onboarding_completed and onboarding_completed_at on the signed-in user’s own profile row', async () => {
    const update = vi.fn().mockReturnValue(chainable({ error: null }));
    const from = vi.fn().mockReturnValue({ update });
    mockVerifiedBusiness(from);

    const result = await markOnboardingCompleted(VERIFIED_BUSINESS_ID);

    expect(result).toEqual({ success: true });
    expect(from).toHaveBeenCalledWith('profiles');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        onboarding_completed: true,
        onboarding_completed_at: expect.any(String)
      })
    );
  });

  it('is idempotent — calling it again after the wizard is already complete never errors or duplicates anything', async () => {
    const update = vi.fn().mockReturnValue(chainable({ error: null }));
    const from = vi.fn().mockReturnValue({ update });
    mockVerifiedBusiness(from);

    const first = await markOnboardingCompleted(VERIFIED_BUSINESS_ID);
    const second = await markOnboardingCompleted(VERIFIED_BUSINESS_ID);

    expect(first).toEqual({ success: true });
    expect(second).toEqual({ success: true });
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('returns a friendly error on a database failure', async () => {
    const update = vi.fn().mockReturnValue(chainable({ error: { message: 'db down' } }));
    const from = vi.fn().mockReturnValue({ update });
    mockVerifiedBusiness(from);

    const result = await markOnboardingCompleted(VERIFIED_BUSINESS_ID);

    expect(result.success).toBe(false);
  });
});
