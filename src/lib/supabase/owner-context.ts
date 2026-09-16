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
 */
export type OwnerContext =
  | { status: 'unauthenticated' }
  | { status: 'incomplete_profile'; user: User; supabase: SupabaseClient }
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
 * disagree about which business is "active".
 *
 * `businesses` must always be the *current* RLS-scoped list for the
 * signed-in owner (fresh on every request — see `loadOwnerContext()`),
 * never a cached or client-remembered one. That's what makes this
 * self-healing against a stale `cookieValue`: the cookie is long-lived
 * (see `active-business-cookie.ts`) and can outlive the business it
 * points at — e.g. a placeholder business that gets deleted once a real
 * business is transferred to its owner. A stale id simply fails the
 * `.some()` check below and falls through to the owner's first
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
