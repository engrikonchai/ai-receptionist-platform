/**
 * The non-httpOnly "which business is active" cookie the sidebar's
 * BusinessSwitcher writes to and every business-scoped Server Component
 * (dashboard layout, Overview, Inbox) reads as a *hint* — never a
 * trusted value on its own; see `resolveActiveBusinessId()` in
 * `owner-context.ts`, which only ever accepts a cookie value that's
 * actually in the signed-in owner's fresh, RLS-scoped business list.
 *
 * Deliberately has no dependency on `next/headers` or any other
 * server-only module, unlike `owner-context.ts` (which imports
 * `createSupabaseServerClient`) — that's what lets client components
 * (BusinessSwitcher, OwnerMenu) import this file directly instead of
 * each redefining the cookie name locally, which had let the two copies
 * silently drift apart.
 */
export const ACTIVE_BUSINESS_COOKIE = 'active_business_id';

export function setActiveBusinessCookie(businessId: string) {
  if (typeof window === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? 'Secure;' : '';
  document.cookie = `${ACTIVE_BUSINESS_COOKIE}=${businessId}; path=/; max-age=31536000; SameSite=Lax; ${secure}`;
}

/**
 * Expires the cookie immediately. Called on sign-out so a business id
 * from the account that just signed out — including one for a business
 * that's since been deleted, reassigned, or belongs to a placeholder no
 * longer reachable — can never be read back as a hint for whichever
 * account signs in next in this same browser.
 */
export function clearActiveBusinessCookie() {
  if (typeof window === 'undefined') return;
  document.cookie = `${ACTIVE_BUSINESS_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}
