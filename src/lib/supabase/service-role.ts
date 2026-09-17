import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A Supabase client authenticated with the service-role key — bypasses
 * every Row Level Security policy in the shared project.
 *
 * This is a narrow, explicit exception to this app's normal rule of
 * never using the service-role key, currently used in exactly three
 * places:
 *   1. The public embeddable widget runtime
 *      (src/lib/public-widget/runtime.ts, called only from
 *      src/app/api/public-widget/{session,message}/route.ts) — a
 *      genuinely multi-tenant, unauthenticated entry point. A visitor's
 *      browser sends only an opaque `public_widget_id`; the trusted
 *      server must resolve that id to a `business_id` itself and use it
 *      to scope every conversation/message/lead/handoff row it writes.
 *      RLS on `businesses`/`widget_settings`/`conversations`/`messages`
 *      grants `anon` nothing at all (by design — see those tables'
 *      policies), so an anon-key client cannot do this resolution or
 *      these writes.
 *   2. The verified Stripe webhook handler
 *      (src/app/api/stripe/webhook/route.ts) — a server-to-server
 *      Stripe callback with no signed-in user or cookie session at all;
 *      it authenticates via the verified Stripe signature instead, then
 *      writes `business_subscriptions`/`stripe_webhook_events` via the
 *      service-role key (through the `sync_business_subscription` RPC).
 *   3. The billing Checkout/Portal server actions
 *      (src/features/billing/api/service.ts,
 *      src/features/billing/api/checkout-attempts.ts) — reading/writing
 *      `business_subscriptions`' Stripe-identifier columns
 *      (`stripe_customer_id`/`stripe_subscription_id`) and the private
 *      `billing_checkout_attempts` table, both of which `authenticated`
 *      has no grant on at all (see
 *      supabase/migrations/20260919090000_business_subscriptions.sql).
 *      Every one of these calls happens only *after*
 *      `verifyActiveBusiness()` has already confirmed the signed-in
 *      owner really owns the business id in question, and is always
 *      additionally filtered by that already-verified id — this client
 *      is never used to widen what a request is allowed to touch, only
 *      to reach columns/tables the `authenticated` role is deliberately
 *      never granted.
 *
 * Hard rules for every caller of this function:
 *   - Server-only. Never imported by a Client Component, never bundled
 *     for the browser, never returned in a response body.
 *   - Never logs the key itself, a client instance, or any query error
 *     object that might embed connection details.
 *   - Never used for anything reachable from the authenticated
 *     dashboard except the narrow, explicitly-verified exception above
 *     (billing) — every other dashboard feature
 *     (`features/*\/api/authorize.ts`) keeps using the cookie-scoped,
 *     RLS-enforced client via `verifyActiveBusiness()`/`loadOwnerContext()`.
 *     Never a general bypass: always gated by a prior explicit
 *     authorization check, and always additionally scoped to the id
 *     that check already verified.
 *   - The public widget runtime that uses this client must always
 *     resolve `business_id` itself from `public_widget_id` — it must
 *     never accept a `business_id` sent by the browser. The billing
 *     actions must always call `verifyActiveBusiness()` first and scope
 *     every query to the id it returns — never a browser-supplied id.
 *
 * Returns `null` when the service-role key isn't configured, matching
 * `createSupabasePublicClient()`'s own convention — callers decide how
 * to respond (the widget runtime and the webhook handler both treat
 * this as "temporarily unavailable", never as "let the request through
 * unchecked").
 */
export function createSupabaseServiceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
