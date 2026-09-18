import { Environment, Paddle } from '@paddle/paddle-node-sdk';

/**
 * Server-only Paddle client factory for the billing foundation
 * (checkout, customer portal, webhook synchronization — see
 * src/features/billing/). Never imported by a Client Component and
 * never bundled for the browser — same hard rule, and same lack of a
 * `server-only` package dependency (this codebase relies on file-layout
 * convention plus `'use server'`/Route Handler boundaries instead), as
 * src/lib/supabase/service-role.ts.
 *
 * Every function here reads `process.env` lazily, inside the function
 * body — never at module load/import time — so this module can be
 * imported (and the production build can complete) even when no Paddle
 * environment variables are configured at all. `getPaddleClient()`
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

export type PaddleRuntimeEnvironment = 'sandbox' | 'production';

/**
 * `PADDLE_ENVIRONMENT` must be exactly `"sandbox"` or `"production"` —
 * anything else (unset, misspelled, blank) returns `null`, which every
 * caller treats as "not configured." This app never silently defaults
 * to `"production"`: a missing/invalid value must fail closed, not
 * quietly start making real-money API calls.
 */
export function getPaddleEnvironment(): PaddleRuntimeEnvironment | null {
  const raw = process.env.PADDLE_ENVIRONMENT?.trim();
  if (raw === 'sandbox' || raw === 'production') return raw;
  return null;
}

export function isPaddleConfigured(): boolean {
  return Boolean(process.env.PADDLE_API_KEY?.trim()) && getPaddleEnvironment() !== null;
}

export function getPaddleClient(): Paddle | null {
  const apiKey = process.env.PADDLE_API_KEY?.trim();
  const environment = getPaddleEnvironment();
  if (!apiKey || !environment) return null;

  return new Paddle(apiKey, {
    environment: environment === 'sandbox' ? Environment.sandbox : Environment.production
  });
}

/** `null` when unset — callers must never fall back to a hardcoded price id. */
export function getPaddlePriceId(): string | null {
  return process.env.PADDLE_PRICE_ID?.trim() || null;
}

/** `null` when unset — the webhook route must reject every request rather than skip signature verification. */
export function getPaddleWebhookSecret(): string | null {
  return process.env.PADDLE_WEBHOOK_SECRET?.trim() || null;
}
