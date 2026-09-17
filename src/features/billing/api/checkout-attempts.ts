import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { syncSubscriptionFromStripe } from '@/lib/stripe/sync';

const UNIQUE_VIOLATION = '23505';
const MAX_CLAIM_DEPTH = 3;

/**
 * The single authoritative expiration this app uses for a Checkout
 * attempt — the exact same value is also passed as Stripe Checkout
 * Session's own `expires_at` at creation
 * (src/features/billing/api/service.ts), so the database attempt and
 * the live Stripe Session always expire together. 31 minutes: one
 * minute of slack above Stripe's strict 30-minute minimum for a
 * Checkout Session's `expires_at`, to absorb the latency between when
 * this timestamp is computed here and when Stripe's own clock stamps
 * the session's `created`.
 */
const EXPIRES_IN_SECONDS = 31 * 60;

export type CheckoutAttemptClaim =
  /** This call won the race — create a fresh Checkout Session using `attemptId` as Stripe's idempotency key and `expiresAt`/`generation` as described below, then call `recordCheckoutSession()`. */
  | { kind: 'new'; attemptId: string; generation: number; expiresAt: Date }
  /** A pending attempt exists but no Stripe Checkout Session id has been recorded for it yet — either another call is still mid-flight, or a prior call's own DB write failed after Stripe already created the session. Resume using the SAME `attemptId` as Stripe's idempotency key (never mint a new one): Stripe's own idempotency guarantee makes this safe whether the original call already succeeded (returns the same session) or never actually reached Stripe (creates it fresh). Use the SAME `expiresAt`/`generation` as the original attempt — Stripe requires identical parameters for a repeated idempotency key. */
  | { kind: 'resume'; attemptId: string; generation: number; expiresAt: Date }
  /** An open, non-expired Checkout Session already exists — hand its URL straight back, no new Stripe API call. */
  | { kind: 'reuse'; url: string }
  /** The recorded session already completed at Stripe and has just been synchronized successfully — the caller should treat this business as subscribed, never start a new Checkout. */
  | { kind: 'already_subscribed' }
  /** The recorded session already completed at Stripe, but its subscription could not be synchronized in this call (Stripe metadata missing, transient DB error, etc.) — a webhook delivery will finish the job; the caller should show a "processing" state, never a second Checkout. */
  | { kind: 'processing' }
  /** Transient — could not safely determine what to do (e.g. a claim race exceeded its retry budget, or Stripe couldn't be reached to check a recorded session's state). Never create a second, competing session here — ask the caller to retry shortly. */
  | { kind: 'retry' };

type PendingAttemptRow = {
  id: string;
  generation: number;
  stripe_checkout_session_id: string | null;
  expires_at: string;
};

/**
 * Resolves a Stripe id reference (Stripe SDK types every relation as
 * `string | ExpandedObject | null` depending on whether the caller
 * asked to expand it) to its plain id.
 */
function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

/**
 * Durable, database-enforced Checkout-creation idempotency (see
 * `billing_checkout_attempts` in
 * supabase/migrations/20260919090000_business_subscriptions.sql). Two
 * simultaneous or retried `startCheckout()` calls for the same business
 * must converge on exactly one Stripe Checkout Session — never a random,
 * per-request idempotency key (that would let two concurrent requests
 * each "successfully" create their own session), never an in-memory
 * lock (useless across serverless invocations), and never just checking
 * `business_subscriptions` (that table isn't written until the webhook
 * fires, well after Checkout Session creation — the actual race this
 * fixes).
 *
 * The atomic primitive is a unique partial index —
 * `billing_checkout_attempts_one_pending_per_business` — allowing at
 * most one `status = 'pending'` row per business. Whichever concurrent
 * INSERT the database accepts is the one true "owner" of this checkout
 * attempt; every other one gets a `23505` unique-violation and must
 * defer to the winner's row instead of creating its own.
 *
 * Critically, a pending attempt's fate is decided by the recorded Stripe
 * Checkout Session's OWN status, never by this app's local clock alone:
 *   - no session id recorded yet → resume with the same idempotency key
 *     (see `CheckoutAttemptClaim`'s `resume` case)
 *   - `open` → reuse it, regardless of how close `expires_at` is
 *   - `complete` → never replaced by a new Checkout, ever — synchronize
 *     (or report `processing` until a webhook does)
 *   - `expired` → the only case a fresh attempt may be claimed
 *
 * Only `service_role` may read or write this table — the caller
 * (`startCheckout()`) must already have run `verifyActiveBusiness()`
 * before calling this.
 */
export async function claimCheckoutAttempt(
  service: SupabaseClient,
  stripe: Stripe,
  businessId: string,
  depth = 0
): Promise<CheckoutAttemptClaim> {
  if (depth > MAX_CLAIM_DEPTH) return { kind: 'retry' };

  const existing = await findPendingAttempt(service, businessId);

  if (!existing) {
    return insertNewAttempt(service, stripe, businessId, depth);
  }

  if (!existing.stripe_checkout_session_id) {
    return {
      kind: 'resume',
      attemptId: existing.id,
      generation: existing.generation,
      expiresAt: new Date(existing.expires_at)
    };
  }

  return resolveExistingSession(service, stripe, businessId, existing, depth);
}

async function findPendingAttempt(
  service: SupabaseClient,
  businessId: string
): Promise<PendingAttemptRow | null> {
  const { data } = await service
    .from('billing_checkout_attempts')
    .select('id, generation, stripe_checkout_session_id, expires_at')
    .eq('business_id', businessId)
    .eq('status', 'pending')
    .maybeSingle();
  return (data as PendingAttemptRow | null) ?? null;
}

async function resolveExistingSession(
  service: SupabaseClient,
  stripe: Stripe,
  businessId: string,
  existing: PendingAttemptRow,
  depth: number
): Promise<CheckoutAttemptClaim> {
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(existing.stripe_checkout_session_id!);
  } catch {
    // Can't verify the recorded session's real state — never create a
    // second one on a guess.
    return { kind: 'retry' };
  }

  if (session.status === 'complete') {
    // Never replaced by a new Checkout, whether or not its webhook has
    // arrived yet — synchronize now if possible, otherwise report a
    // controlled "processing" state until a webhook delivery finishes
    // the job.
    await markAttemptStatus(service, existing.id, 'completed');
    const subscriptionId = idOf(session.subscription);
    if (subscriptionId) {
      const result = await syncSubscriptionFromStripe(service, stripe, subscriptionId);
      if (result.ok) return { kind: 'already_subscribed' };
    }
    return { kind: 'processing' };
  }

  if (session.status === 'open' && session.url) {
    return { kind: 'reuse', url: session.url };
  }

  // `expired` (or an unusable `open` session with no url) — the only
  // case where the old attempt is confirmed truly dead. Free it and
  // claim a fresh one, never merely because our own clock says
  // `expires_at` has passed.
  await markAttemptStatus(service, existing.id, 'expired');
  return claimCheckoutAttempt(service, stripe, businessId, depth + 1);
}

async function insertNewAttempt(
  service: SupabaseClient,
  stripe: Stripe,
  businessId: string,
  depth: number
): Promise<CheckoutAttemptClaim> {
  const attemptId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + EXPIRES_IN_SECONDS * 1000);

  const { data, error } = await service
    .from('billing_checkout_attempts')
    .insert({
      id: attemptId,
      business_id: businessId,
      status: 'pending',
      expires_at: expiresAt.toISOString()
    })
    .select('generation')
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      // Lost a race that happened between the lookup and this insert —
      // re-run the claim against whatever now exists.
      return claimCheckoutAttempt(service, stripe, businessId, depth + 1);
    }
    return { kind: 'retry' };
  }

  return {
    kind: 'new',
    attemptId,
    generation: (data as { generation: number }).generation,
    expiresAt
  };
}

async function markAttemptStatus(
  service: SupabaseClient,
  attemptId: string,
  status: 'completed' | 'expired'
): Promise<void> {
  await service.from('billing_checkout_attempts').update({ status }).eq('id', attemptId);
}

/**
 * Records the Checkout Session created for a claimed attempt — called
 * only by the `new`/`resume` branch's own caller, immediately after
 * Stripe returns the session. Returns a typed result so
 * `startCheckout()` never pretends the write succeeded when it didn't:
 * the Stripe Session itself is still valid and usable either way (its
 * URL is returned to the caller regardless), but a subsequent
 * `startCheckout()` retry needs to know the DB never durably recorded
 * it, so `claimCheckoutAttempt()` can resume with the SAME attempt
 * id/idempotency key rather than assuming a fresh attempt is needed.
 */
export async function recordCheckoutSession(
  service: SupabaseClient,
  attemptId: string,
  stripeCheckoutSessionId: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { error } = await service
    .from('billing_checkout_attempts')
    .update({ stripe_checkout_session_id: stripeCheckoutSessionId })
    .eq('id', attemptId);

  if (error) return { ok: false, reason: error.code ?? 'db_error' };
  return { ok: true };
}
