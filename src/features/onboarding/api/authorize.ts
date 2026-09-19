import type { SupabaseClient, User } from '@supabase/supabase-js';
import { loadOwnerContext } from '@/lib/supabase/owner-context';
import { NO_BUSINESS_ACCESS_MESSAGE, SESSION_EXPIRED_MESSAGE } from './types';

export type VerifiedBusinessContext = {
  supabase: SupabaseClient;
  user: User;
  businessId: string;
};

export type VerifyBusinessResult =
  | { ok: true; ctx: VerifiedBusinessContext }
  | { ok: false; error: string };

/**
 * The one place every onboarding query and action funnels through
 * before touching `businesses`, `widget_settings`, or `profiles`.
 * Re-loads the signed-in owner's session and the businesses Row Level
 * Security lets them see (never the service-role key), then confirms
 * the requested business id is actually one of theirs — a business id
 * is never trusted just because a caller (a prop threaded down from a
 * Server Component, a browser-supplied value) supplied it.
 *
 * Deliberately duplicated from src/features/widget/api/authorize.ts /
 * src/features/knowledge/api/authorize.ts (same logic, same messages)
 * rather than imported cross-feature — each feature owns its own thin
 * authorization wrapper over the shared `loadOwnerContext()`, per this
 * app's existing convention (see widget/api/authorize.ts's own doc
 * comment for why).
 */
export async function verifyActiveBusiness(
  businessId: string | null | undefined
): Promise<VerifyBusinessResult> {
  if (!businessId) return { ok: false, error: 'No business selected.' };

  const ctx = await loadOwnerContext();

  if (ctx.status === 'unauthenticated') {
    return { ok: false, error: SESSION_EXPIRED_MESSAGE };
  }

  if (ctx.status === 'incomplete_profile') {
    return { ok: false, error: NO_BUSINESS_ACCESS_MESSAGE };
  }

  // V1 fail-closed case (see OwnerContext's own doc comment) — never
  // trusts a requested business id against an ambiguous owner state.
  if (ctx.status === 'multiple_businesses') {
    return { ok: false, error: NO_BUSINESS_ACCESS_MESSAGE };
  }

  const business = ctx.businesses.find((b) => b.id === businessId);
  if (!business) {
    return { ok: false, error: NO_BUSINESS_ACCESS_MESSAGE };
  }

  return {
    ok: true,
    ctx: { supabase: ctx.supabase, user: ctx.user, businessId: business.id }
  };
}
