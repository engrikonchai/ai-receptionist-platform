import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BusinessRow } from '@/lib/supabase/database.types';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadOwnerContext, resolveActiveBusinessId } from './owner-context';

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn()
}));

function business(id: string): BusinessRow {
  return { id } as BusinessRow;
}

/**
 * Minimal Supabase client stub covering exactly the calls
 * loadOwnerContext() makes: auth.getUser(), then
 * from('profiles').select().eq().maybeSingle() and
 * from('businesses').select().order() in parallel.
 */
function stubSupabase({
  user,
  profile,
  businesses
}: {
  user: { id: string; email?: string } | null;
  profile?: unknown;
  businesses?: unknown[] | null;
}) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: profile ?? null })
            })
          })
        };
      }
      if (table === 'businesses') {
        return {
          select: () => ({
            order: () => Promise.resolve({ data: businesses ?? null })
          })
        };
      }
      throw new Error(`Unexpected table in stub: ${table}`);
    })
  } as unknown as SupabaseClient;
}

describe('resolveActiveBusinessId', () => {
  it('uses the cookie value when it matches one of the owner’s current businesses', () => {
    const businesses = [business('biz-a'), business('biz-b')];
    expect(resolveActiveBusinessId(businesses, 'biz-b')).toBe('biz-b');
  });

  it('falls back to the first business when no cookie is set', () => {
    const businesses = [business('biz-a'), business('biz-b')];
    expect(resolveActiveBusinessId(businesses, undefined)).toBe('biz-a');
  });

  it('falls back to the first business when the cookie is empty', () => {
    const businesses = [business('biz-a')];
    expect(resolveActiveBusinessId(businesses, '')).toBe('biz-a');
  });

  it('returns null when the owner has no businesses at all', () => {
    expect(resolveActiveBusinessId([], 'biz-a')).toBeNull();
    expect(resolveActiveBusinessId([], undefined)).toBeNull();
  });

  /**
   * The transferred-business regression: a placeholder business is
   * deleted after a real business is transferred to its owner. The
   * cookie — long-lived and written client-side, see
   * active-business-cookie.ts — can still hold the deleted placeholder's
   * id. `businesses` here is always the owner's *current*, fresh,
   * RLS-scoped list (never a cached one), so the deleted id can never
   * appear in it, and this must never trust that stale id — it must
   * fall through to the owner's real, current business instead of
   * resolving to `null` or to the deleted business.
   */
  it('falls back to the current business when the cookie references a deleted/transferred-away placeholder', () => {
    const transferredBusiness = business('real-business-c35003d0');
    const businesses = [transferredBusiness];
    const staleCookieFromDeletedPlaceholder = 'deleted-placeholder-id';

    expect(resolveActiveBusinessId(businesses, staleCookieFromDeletedPlaceholder)).toBe(
      transferredBusiness.id
    );
  });

  /**
   * Switching accounts in the same browser: a stale cookie from a
   * previous owner's session must never resolve to a business it
   * doesn't actually own. Since `businesses` is always this request's
   * own RLS-scoped list, a cookie id belonging to a different owner
   * entirely can never match — same fallback behavior as the deleted-
   * placeholder case above, exercised here with a completely unrelated
   * owner's business id instead of a deleted one.
   */
  it('falls back to the current owner’s own business when the cookie belongs to a different account entirely', () => {
    const thisOwnersBusiness = business('biz-owned-by-current-user');
    const businesses = [thisOwnersBusiness];
    const cookieFromPreviousAccountInSameBrowser = 'biz-owned-by-someone-else';

    expect(resolveActiveBusinessId(businesses, cookieFromPreviousAccountInSameBrowser)).toBe(
      thisOwnersBusiness.id
    );
  });
});

describe('loadOwnerContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns unauthenticated when there is no signed-in user', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(stubSupabase({ user: null }));

    const ctx = await loadOwnerContext();

    expect(ctx.status).toBe('unauthenticated');
  });

  it('returns ok with exactly the one owned business when the owner has exactly one', async () => {
    const owned = business('biz-owned');
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      stubSupabase({
        user: { id: 'user-1' },
        profile: { id: 'user-1', onboarding_completed: true },
        businesses: [owned]
      })
    );

    const ctx = await loadOwnerContext();

    expect(ctx.status).toBe('ok');
    if (ctx.status === 'ok') {
      expect(ctx.businesses).toEqual([owned]);
    }
  });

  it('returns incomplete_profile (the existing onboarding/error behavior) when the owner has zero businesses', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      stubSupabase({
        user: { id: 'user-1' },
        profile: { id: 'user-1', onboarding_completed: false },
        businesses: []
      })
    );

    const ctx = await loadOwnerContext();

    expect(ctx.status).toBe('incomplete_profile');
  });

  it('returns incomplete_profile when the profile row itself does not exist yet, even if businesses is non-empty', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      stubSupabase({
        user: { id: 'user-1' },
        profile: null,
        businesses: [business('biz-owned')]
      })
    );

    const ctx = await loadOwnerContext();

    expect(ctx.status).toBe('incomplete_profile');
  });

  /**
   * The V1 fail-closed guard: this should be unreachable once
   * supabase/migrations/20260921090000_single_business_per_owner.sql is
   * applied, but loadOwnerContext() must never silently resolve to
   * `businesses[0]` if the database somehow still returns more than
   * one owned business — checked here before the "no business" branch,
   * and confirmed to carry only a count, never the business rows or
   * their ids (so nothing here can end up in a browser-visible error
   * or a log).
   */
  it('fails closed with multiple_businesses — carrying only a count, never the business rows — when more than one business is returned', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      stubSupabase({
        user: { id: 'user-1' },
        profile: { id: 'user-1', onboarding_completed: true },
        businesses: [business('biz-a'), business('biz-b'), business('biz-c')]
      })
    );

    const ctx = await loadOwnerContext();

    expect(ctx.status).toBe('multiple_businesses');
    if (ctx.status === 'multiple_businesses') {
      expect(ctx.businessCount).toBe(3);
      expect(ctx).not.toHaveProperty('businesses');
      expect(JSON.stringify(ctx)).not.toMatch(/biz-a|biz-b|biz-c/);
    }
  });
});
