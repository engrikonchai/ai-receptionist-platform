import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A Supabase client authenticated with the service-role key — bypasses
 * every Row Level Security policy in the shared project.
 *
 * This is a narrow, explicit exception to this app's normal rule of
 * never using the service-role key. It exists for exactly one reason:
 * the public embeddable widget runtime (src/lib/public-widget/runtime.ts,
 * called only from src/app/api/public-widget/{session,message}/route.ts)
 * is a genuinely multi-tenant, unauthenticated entry point. A visitor's
 * browser sends only an opaque `public_widget_id`; the trusted server
 * must resolve that id to a `business_id` itself and use it to scope
 * every conversation/message/lead/handoff row it writes. RLS on
 * `businesses`/`widget_settings`/`conversations`/`messages` grants
 * `anon` nothing at all (by design — see those tables' policies), so an
 * anon-key client cannot do this resolution or these writes; the
 * service-role key is the only way for a request with no signed-in
 * owner to act as "the one correct business" instead of none.
 *
 * Hard rules for every caller of this function:
 *   - Server-only. Never imported by a Client Component, never bundled
 *     for the browser, never returned in a response body.
 *   - Never logs the key itself, a client instance, or any query error
 *     object that might embed connection details.
 *   - Never used for anything reachable from the authenticated
 *     dashboard — every dashboard feature (`features/*\/api/authorize.ts`)
 *     keeps using the cookie-scoped, RLS-enforced client via
 *     `verifyActiveBusiness()`/`loadOwnerContext()`. This client exists
 *     only inside the public widget runtime's own trust boundary.
 *   - The runtime that uses this client must always resolve
 *     `business_id` itself from `public_widget_id` — it must never
 *     accept a `business_id` sent by the browser.
 *
 * Returns `null` when the service-role key isn't configured, matching
 * `createSupabasePublicClient()`'s own convention — callers decide how
 * to respond (the widget runtime treats this as "temporarily
 * unavailable", never as "let the request through unchecked").
 */
export function createSupabaseServiceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
