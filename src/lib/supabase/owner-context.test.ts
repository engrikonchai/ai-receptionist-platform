import { describe, expect, it } from 'vitest';
import type { BusinessRow } from '@/lib/supabase/database.types';
import { resolveActiveBusinessId } from './owner-context';

function business(id: string): BusinessRow {
  return { id } as BusinessRow;
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
