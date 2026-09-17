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
 * The one place every leads query and action funnels through before
 * touching `leads` or `handoffs`. Re-loads the signed-in owner's session
 * and the businesses Row Level Security lets them see (never the
 * service-role key), then confirms the requested business id is
 * actually one of theirs — a business id is never trusted just because
 * a caller (a cookie, a browser-supplied value) supplied it. Every
 * table read/write downstream still filters by this verified id in
 * addition to RLS, so a spoofed id can never surface another owner's
 * data even if this check were somehow bypassed.
 *
 * Deliberately duplicated from src/features/inbox/api/authorize.ts and
 * src/features/knowledge/api/authorize.ts (same logic, same messages)
 * rather than imported cross-feature — each feature owns its own thin
 * authorization wrapper over the shared `loadOwnerContext()`, per this
 * app's existing convention.
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

  const business = ctx.businesses.find((b) => b.id === businessId);
  if (!business) {
    return { ok: false, error: NO_BUSINESS_ACCESS_MESSAGE };
  }

  return {
    ok: true,
    ctx: { supabase: ctx.supabase, user: ctx.user, businessId: business.id }
  };
}
