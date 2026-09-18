import type { SupabaseClient } from '@supabase/supabase-js';
import type { Paddle } from '@paddle/paddle-node-sdk';
import { syncSubscriptionFromPaddle } from '@/lib/paddle/sync';

const UNIQUE_VIOLATION = '23505';
const MAX_CLAIM_DEPTH = 3;

/** Paddle transaction states that mean "payment succeeded, a subscription may now exist." */
const SUCCEEDED_TRANSACTION_STATUSES = new Set(['paid', 'billed', 'completed']);
/** Paddle transaction states that mean "still open — the same Checkout overlay can be reopened." */
const OPEN_TRANSACTION_STATUSES = new Set(['draft', 'ready']);

export type CheckoutAttemptClaim =
  /** This call won the race — create a fresh Paddle transaction, then call `recordTransactionId()`. */
  | { kind: 'new'; attemptId: string; generation: number }
  /** An open (unpaid, uncanceled) transaction already exists for this business — reopen the SAME Paddle Checkout overlay with this transaction id, never create a second one. */
  | { kind: 'reuse'; transactionId: string }
  /** The recorded transaction already succeeded at Paddle and has just been synchronized successfully — the caller should treat this business as subscribed, never start a new Checkout. */
  | { kind: 'already_subscribed' }
  /** The recorded transaction already succeeded at Paddle, but its subscription could not be synchronized in this call — a webhook delivery will finish the job; the caller should show a "processing" state, never a second Checkout. */
  | { kind: 'processing' }
  /** Transient — could not safely determine what to do. This covers BOTH a genuinely ambiguous Paddle API failure AND the case where a pending attempt exists with no transaction id recorded yet: the Paddle Node SDK's `transactions.create()` has no request-level idempotency key, so a second caller can never safely "resume" by calling it again — only the original winning claimer may ever create the transaction. Never create a second, competing transaction here — ask the caller to retry shortly. */
  | { kind: 'retry' };

type PendingAttemptRow = {
  id: string;
  generation: number;
  paddle_transaction_id: string | null;
};

/**
 * Durable, database-enforced Checkout-creation concurrency safety (see
 * `billing_checkout_attempts` in
 * supabase/migrations/20260920100000_paddle_billing_foundation.sql). Two
 * simultaneous or retried `startCheckout()` calls for the same business
 * must converge on exactly one Paddle transaction/subscription — never
 * just checking `business_subscriptions` (that table isn't written
 * until the webhook fires, well after transaction creation — the actual
 * race this fixes).
 *
 * The atomic primitive is a unique partial index —
 * `billing_checkout_attempts_one_pending_per_business` — allowing at
 * most one `status = 'pending'` row per business. Whichever concurrent
 * INSERT the database accepts is the one true "owner" of this checkout
 * attempt; every other one gets a `23505` unique-violation and must
 * defer to the winner's row instead of creating its own.
 *
 * Critically — and unlike a provider that supports a request-level
 * idempotency key — a pending attempt with no `paddle_transaction_id`
 * recorded yet can NEVER be safely "resumed" by a second caller: the
 * Paddle Node SDK's `transactions.create()` has no idempotency-key
 * parameter at all, so calling it twice for the same logical attempt
 * would risk genuinely creating two Paddle transactions. Only the
 * original winning claimer may ever create the transaction; every other
 * caller is told to retry shortly instead.
 *
 * Once a transaction id IS recorded, its Paddle-reported status decides
 * everything, never this app's local clock alone:
 *   - `draft`/`ready` (still open) → reuse it
 *   - `paid`/`billed`/`completed` → synchronize (or report `processing`
 *     until a webhook does) — never replaced by a new Checkout
 *   - `canceled`/`past_due` → the only case a fresh attempt may be
 *     claimed
 *
 * Only `service_role` may read or write this table — the caller
 * (`startCheckout()`) must already have run `verifyActiveBusiness()`
 * before calling this.
 */
export async function claimCheckoutAttempt(
  service: SupabaseClient,
  paddle: Paddle,
  businessId: string,
  depth = 0
): Promise<CheckoutAttemptClaim> {
  if (depth > MAX_CLAIM_DEPTH) return { kind: 'retry' };

  const existing = await findPendingAttempt(service, businessId);

  if (!existing) {
    return insertNewAttempt(service, businessId, paddle, depth);
  }

  if (!existing.paddle_transaction_id) {
    return { kind: 'retry' };
  }

  return resolveExistingTransaction(service, paddle, businessId, existing, depth);
}

async function findPendingAttempt(
  service: SupabaseClient,
  businessId: string
): Promise<PendingAttemptRow | null> {
  const { data } = await service
    .from('billing_checkout_attempts')
    .select('id, generation, paddle_transaction_id')
    .eq('business_id', businessId)
    .eq('status', 'pending')
    .maybeSingle();
  return (data as PendingAttemptRow | null) ?? null;
}

async function resolveExistingTransaction(
  service: SupabaseClient,
  paddle: Paddle,
  businessId: string,
  existing: PendingAttemptRow,
  depth: number
): Promise<CheckoutAttemptClaim> {
  let transaction: Awaited<ReturnType<Paddle['transactions']['get']>>;
  try {
    transaction = await paddle.transactions.get(existing.paddle_transaction_id!);
  } catch {
    // Can't verify the recorded transaction's real state — never create
    // a second one on a guess.
    return { kind: 'retry' };
  }

  if (SUCCEEDED_TRANSACTION_STATUSES.has(transaction.status)) {
    // Never replaced by a new Checkout, whether or not its webhook has
    // arrived yet — synchronize now if possible, otherwise report a
    // controlled "processing" state until a webhook delivery finishes
    // the job. `eventOccurredAt: null` — this is a best-effort proactive
    // peek, not a real webhook delivery, so it must never fabricate a
    // timestamp that could later reject a genuine, earlier-occurring
    // webhook event for this same subscription (see sync.ts).
    await markAttemptStatus(service, existing.id, 'completed');
    if (transaction.subscriptionId) {
      try {
        const subscription = await paddle.subscriptions.get(transaction.subscriptionId);
        const result = await syncSubscriptionFromPaddle(service, subscription, null);
        if (result.ok) return { kind: 'already_subscribed' };
      } catch {
        // Fall through to `processing` — a webhook will finish the job.
      }
    }
    return { kind: 'processing' };
  }

  if (OPEN_TRANSACTION_STATUSES.has(transaction.status)) {
    return { kind: 'reuse', transactionId: transaction.id };
  }

  // `canceled`/`past_due` (or any other unexpected status) — the only
  // case where the old attempt is confirmed truly dead. Free it and
  // claim a fresh one, never merely because our own clock thinks enough
  // time has passed.
  await markAttemptStatus(service, existing.id, 'expired');
  return claimCheckoutAttempt(service, paddle, businessId, depth + 1);
}

async function insertNewAttempt(
  service: SupabaseClient,
  businessId: string,
  paddle: Paddle,
  depth: number
): Promise<CheckoutAttemptClaim> {
  const attemptId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 31 * 60 * 1000);

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
      return claimCheckoutAttempt(service, paddle, businessId, depth + 1);
    }
    return { kind: 'retry' };
  }

  return { kind: 'new', attemptId, generation: (data as { generation: number }).generation };
}

async function markAttemptStatus(
  service: SupabaseClient,
  attemptId: string,
  status: 'completed' | 'expired'
): Promise<void> {
  await service.from('billing_checkout_attempts').update({ status }).eq('id', attemptId);
}

/**
 * Records the Paddle transaction created for a claimed attempt — called
 * only by the `new` branch's own caller, immediately after Paddle
 * returns the transaction. Returns a typed result so `startCheckout()`
 * never pretends the write succeeded when it didn't: the Paddle
 * transaction itself is still valid and usable either way (its id is
 * returned to the caller regardless), but recording failure means a
 * concurrent/retried caller will get `retry` rather than `reuse` until
 * this succeeds — never a fabricated second transaction, since Paddle
 * has no idempotency key to make that safe.
 */
export async function recordTransactionId(
  service: SupabaseClient,
  attemptId: string,
  paddleTransactionId: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { error } = await service
    .from('billing_checkout_attempts')
    .update({ paddle_transaction_id: paddleTransactionId })
    .eq('id', attemptId);

  if (error) return { ok: false, reason: error.code ?? 'db_error' };
  return { ok: true };
}
