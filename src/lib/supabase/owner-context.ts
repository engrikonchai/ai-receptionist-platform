import type { SupabaseClient, User } from '@supabase/supabase-js';
import { ACTIVE_BUSINESS_COOKIE } from '@/lib/active-business-cookie';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { BusinessRow, ProfileRow } from '@/lib/supabase/database.types';

export { ACTIVE_BUSINESS_COOKIE };

/**
 * The signed-in owner's session + the profile/business rows Row Level
 * Security lets them see, loaded once and shared by every server-side
 * page that needs to decide where to send them (dashboard, onboarding,
 * login, signup). Never uses the service-role key — everything here
 * runs through `createSupabaseServerClient()`, scoped by RLS.
 *
 * `incomplete_profile` covers the edge case where a signed-in user has
 * no profile row and/or no business yet (the onboarding trigger hasn't
 * fired, or fired partially) — callers should show a safe recovery
 * state instead of redirecting, so this never turns into a loop between
 * /dashboard and /onboarding.
 *
 * `multiple_businesses` is the V1 single-business-per-owner rule's own
 * fail-closed case: `businesses` returning more than one row for a
 * single owner should be impossible once
 * supabase/migrations/20260921090000_single_business_per_owner.sql has
 * been applied, but this app must never silently pick one of them
 * (e.g. `businesses[0]`) as "the" business if it somehow still
 * happens — before that migration runs, mid-migration, or from any
 * future regression. Callers show a safe generic error instead of
 * guessing. Deliberately carries only a count, never the business rows
 * or their ids, so nothing here can end up in a browser-visible error
 * or a log.
 */
export type OwnerContext =
  | { status: 'unauthenticated' }
  | { status: 'incomplete_profile'; user: User; supabase: SupabaseClient }
  | { status: 'multiple_businesses'; user: User; businessCount: number; supabase: SupabaseClient }
  | {
      status: 'ok';
      user: User;
      profile: ProfileRow;
      businesses: BusinessRow[];
      supabase: SupabaseClient;
    };

/**
 * The same "cookie value if it's actually one of this owner's
 * businesses, else the first one" rule used by every business-scoped
 * page (dashboard shell/sidebar, Overview, Inbox), so they never
 * disagree about which business is "active". Under the V1 single-
 * business rule `businesses` here holds at most one row (the caller
 * already routed away via `OwnerContext`'s `multiple_businesses` status
 * otherwise), so this mostly just answers "does the owner have a
 * business at all" — the cookie can no longer select between several,
 * only ever confirm or fall back to the one the owner has.
 *
 * `businesses` must always be the *current* RLS-scoped list for the
 * signed-in owner (fresh on every request — see `loadOwnerContext()`),
 * never a cached or client-remembered one. That's what makes this
 * self-healing against a stale `cookieValue`: the cookie is long-lived
 * (see `active-business-cookie.ts`) and can reference a business that
 * no longer resolves for this owner — a placeholder that was deleted,
 * or (most importantly) a completely different owner's id left over
 * from a previous account signed in on this same browser. A cookie
 * value that isn't in this owner's own fresh `businesses` list simply
 * fails the `.some()` check below and falls through to the owner's own
 * (now-current) business instead of ever being trusted on its own.
 */
export function resolveActiveBusinessId(
  businesses: BusinessRow[],
  cookieValue: string | undefined
): string | null {
  return (
    (cookieValue && businesses.some((b) => b.id === cookieValue)
      ? cookieValue
      : businesses[0]?.id) ?? null
  );
}

/** Assumes `isSupabaseConfigured()` was already checked by the caller. */
export async function loadOwnerContext(): Promise<OwnerContext> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: 'unauthenticated' };

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return { status: 'unauthenticated' };

  const [{ data: profile }, { data: businesses }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('businesses').select('*').order('created_at', { ascending: true })
  ]);

  // Checked before the "no business yet" case below: the V1 product
  // rule is one owner, one business, enforced in the database by
  // supabase/migrations/20260921090000_single_business_per_owner.sql.
  // `businesses.length > 1` should be unreachable once that migration
  // is applied — this is the deliberate fail-closed guard for before
  // it runs, mid-migration, or any future regression. Never picks
  // `businesses[0]` and moves on.
  if (businesses && businesses.length > 1) {
    return { status: 'multiple_businesses', user, businessCount: businesses.length, supabase };
  }

  if (!profile || !businesses || businesses.length === 0) {
    return { status: 'incomplete_profile', user, supabase };
  }

  return {
    status: 'ok',
    user,
    profile: profile as ProfileRow,
    businesses: businesses as BusinessRow[],
    supabase
  };
}
