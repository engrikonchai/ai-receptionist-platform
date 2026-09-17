import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

const UNIQUE_VIOLATION = '23505';

export type CheckoutAttemptClaim =
  /** This call won the race — create a fresh Checkout Session using `attemptId` as Stripe's idempotency key, then call `recordCheckoutSession()`. */
  | { kind: 'new'; attemptId: string }
  /** Another call already finished creating a session for this business — hand its URL straight back, no new Stripe API call. */
  | { kind: 'reuse'; url: string }
  /** Another call currently holds the pending attempt but hasn't recorded a session yet (still mid-flight), or its recorded session turned out to be stale. Never create a second, competing session here — ask the caller to retry shortly instead. */
  | { kind: 'retry' };

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
 * Only `service_role` may read or write this table — the caller
 * (`startCheckout()`) must already have run `verifyActiveBusiness()`
 * before calling this.
 */
export async function claimCheckoutAttempt(
  service: SupabaseClient,
  stripe: Stripe,
  businessId: string
): Promise<CheckoutAttemptClaim> {
  // Best-effort: free up a business whose previous attempt was
  // abandoned (tab closed before Stripe ever redirected anywhere) so a
  // fresh attempt isn't blocked forever. Not itself the atomic
  // guarantee — the unique partial index is — so a failure here is safe
  // to ignore and simply try the insert below.
  await service
    .from('billing_checkout_attempts')
    .update({ status: 'expired' })
    .eq('business_id', businessId)
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString());

  const attemptId = crypto.randomUUID();
  const { error: insertError } = await service
    .from('billing_checkout_attempts')
    .insert({ id: attemptId, business_id: businessId, status: 'pending' });

  if (!insertError) {
    return { kind: 'new', attemptId };
  }

  if (insertError.code !== UNIQUE_VIOLATION) {
    return { kind: 'retry' };
  }

  // Lost the race — someone else's pending row already exists for this
  // business. Read it back and reuse its Checkout Session if it has
  // one.
  const { data: existing } = await service
    .from('billing_checkout_attempts')
    .select('id, stripe_checkout_session_id')
    .eq('business_id', businessId)
    .eq('status', 'pending')
    .maybeSingle();

  const existingSessionId = existing?.stripe_checkout_session_id as string | null | undefined;
  if (existingSessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(existingSessionId);
      if (session.status === 'open' && session.url) {
        return { kind: 'reuse', url: session.url };
      }
    } catch {
      // A broken/expired session must not be handed back — fall through
      // to `retry` below rather than surfacing a dead Stripe URL.
    }
  }

  // The winning request is still mid-flight (no session id recorded
  // yet) or its session turned out to be stale. Never create a second,
  // competing Checkout Session here.
  return { kind: 'retry' };
}

/** Records the Checkout Session created for a claimed attempt — called only by the `{ kind: 'new' }` branch's own caller, immediately after Stripe returns the session. */
export async function recordCheckoutSession(
  service: SupabaseClient,
  attemptId: string,
  stripeCheckoutSessionId: string
): Promise<void> {
  await service
    .from('billing_checkout_attempts')
    .update({ stripe_checkout_session_id: stripeCheckoutSessionId })
    .eq('id', attemptId);
}
