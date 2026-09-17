import Stripe from 'stripe';

/**
 * Server-only Stripe client factory for the billing foundation
 * (checkout, customer portal, webhook synchronization — see
 * src/features/billing/). Never imported by a Client Component and
 * never bundled for the browser — same hard rule, and same lack of a
 * `server-only` package dependency (this codebase relies on file-layout
 * convention plus `'use server'`/Route Handler boundaries instead), as
 * src/lib/supabase/service-role.ts.
 *
 * Pinned to the API version this SDK version (`stripe@22.x`) ships
 * types for — deliberately explicit rather than "whatever the Stripe
 * account's dashboard default is currently set to", so a future
 * dashboard-side default change can never silently change this app's
 * request/response shapes out from under it.
 *
 * Every function here reads `process.env` lazily, inside the function
 * body — never at module load/import time — so this module can be
 * imported (and the production build can complete) even when no Stripe
 * environment variables are configured at all. `getStripeClient()`
 * mirrors `createSupabaseServiceRoleClient()`'s own "return null if not
 * configured" convention (src/lib/supabase/service-role.ts) rather than
 * throwing — callers decide how to respond, and every billing action in
 * this app treats a null client as a controlled "billing isn't
 * configured yet" result, never as permission to proceed unchecked.
 *
 * Deliberately NOT cached in a module-level singleton: a fresh client
 * is cheap to construct, and caching would let a test (or a genuine key
 * rotation without a process restart) silently keep using a stale key
 * captured on the first call.
 */
const STRIPE_API_VERSION = '2026-08-26.dahlia';

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripeClient(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;

  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    typescript: true
  });
}

/** `null` when unset — callers must never fall back to a hardcoded price id. */
export function getStripePriceId(): string | null {
  return process.env.STRIPE_PRICE_ID?.trim() || null;
}

/** `null` when unset — the webhook route must reject every request rather than skip signature verification. */
export function getStripeWebhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}
