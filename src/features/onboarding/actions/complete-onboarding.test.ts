import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { completeOnboarding } from './complete-onboarding';

vi.mock('@/lib/supabase/env', () => ({
  isSupabaseConfigured: vi.fn(() => true)
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn()
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    // Mirrors the real `redirect()`: throw a digest-carrying error instead
    // of returning, so a caller that (incorrectly) wraps this in try/catch
    // would observe a thrown error rather than a silent success return.
    const error = new Error('NEXT_REDIRECT') as Error & { digest: string };
    error.digest = `NEXT_REDIRECT;replace;${url};307;`;
    throw error;
  })
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn()
}));

const validInput = {
  businessName: 'Riviera Stay Apartments',
  businessType: 'apartment' as const,
  location: 'Budva, Montenegro',
  defaultLanguage: 'en' as const,
  supportedLanguages: ['en' as const],
  handoffEmail: 'owner@example.com',
  widgetTitle: 'Riviera Stay Assistant',
  welcomeMessage: 'Hi! How can I help you today?'
};

function createMockSupabase(
  opts: {
    businessLoadError?: boolean;
    businessUpdateError?: boolean;
    widgetUpdateError?: boolean;
    profileUpdateError?: boolean;
  } = {}
) {
  const from = vi.fn((table: string) => {
    if (table === 'businesses') {
      return {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi
                .fn()
                .mockResolvedValue(
                  opts.businessLoadError
                    ? { data: null, error: { message: 'load failed' } }
                    : { data: { id: 'business-1' }, error: null }
                )
            })
          })
        }),
        update: vi.fn().mockReturnValue({
          eq: vi
            .fn()
            .mockResolvedValue(
              opts.businessUpdateError ? { error: { message: 'update failed' } } : { error: null }
            )
        })
      };
    }
    if (table === 'widget_settings') {
      return {
        update: vi.fn().mockReturnValue({
          eq: vi
            .fn()
            .mockResolvedValue(
              opts.widgetUpdateError ? { error: { message: 'update failed' } } : { error: null }
            )
        })
      };
    }
    if (table === 'profiles') {
      return {
        update: vi.fn().mockReturnValue({
          eq: vi
            .fn()
            .mockResolvedValue(
              opts.profileUpdateError ? { error: { message: 'update failed' } } : { error: null }
            )
        })
      };
    }
    throw new Error(`Unexpected table in test: ${table}`);
  });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    },
    from
  } as unknown as SupabaseClient;
}

describe('completeOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('propagates the redirect instead of returning a result once every update succeeds', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(createMockSupabase());

    // A successful redirect() throws (by design — see complete-onboarding.ts),
    // so the action must never resolve to a value on this path. Asserting
    // rejection here is the regression guard: if redirect() were ever moved
    // back inside a try/catch that swallows it, this would instead resolve
    // with `{ success: true }` and the test would fail.
    await expect(completeOnboarding(validInput)).rejects.toMatchObject({
      digest: expect.stringContaining('NEXT_REDIRECT')
    });

    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/overview');
    expect(redirect).toHaveBeenCalledWith('/dashboard/overview');

    const revalidateOrder = vi.mocked(revalidatePath).mock.invocationCallOrder[0];
    const redirectOrder = vi.mocked(redirect).mock.invocationCallOrder[0];
    expect(revalidateOrder).toBeLessThan(redirectOrder);
  });

  it('returns a normal error result when the profile update fails, without redirecting', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createMockSupabase({ profileUpdateError: true })
    );

    const result = await completeOnboarding(validInput);

    expect(result).toEqual({
      success: false,
      error: 'Your business details were saved, but we could not finish setup. Please try again.'
    });
    expect(redirect).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('short-circuits before any redirect when the business update fails', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createMockSupabase({ businessUpdateError: true })
    );

    const result = await completeOnboarding(validInput);

    expect(result).toEqual({ success: false, error: 'Something went wrong. Please try again.' });
    expect(redirect).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
