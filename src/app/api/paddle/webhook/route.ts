import { EventName } from '@paddle/paddle-node-sdk';
import type { EventEntity, Paddle } from '@paddle/paddle-node-sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { getPaddleClient, getPaddleWebhookSecret } from '@/lib/paddle/client';
import { syncSubscriptionFromPaddle } from '@/lib/paddle/sync';
import {
  classifyWebhookVerificationFailure,
  logWebhookSignatureFailure
} from '@/lib/paddle/webhook-signature-diagnostics';

/**
 * Paddle's own webhook signing requires the exact raw request bytes —
 * re-serializing a parsed JSON body would change whitespace/key order
 * and fail signature verification. Next.js Route Handlers give the raw
 * body via `request.text()` by default.
 *
 * Exact notification destination setup (Paddle sandbox dashboard →
 * Developer tools → Notifications → add destination):
 *   URL:    https://<your-domain>/api/paddle/webhook
 *   Events: subscription.created, subscription.updated,
 *           subscription.activated, subscription.trialing,
 *           subscription.past_due, subscription.paused,
 *           subscription.canceled, subscription.resumed,
 *           transaction.completed
 */

const UNIQUE_VIOLATION = '23505';

const SUBSCRIPTION_EVENT_TYPES = new Set<string>([
  EventName.SubscriptionCreated,
  EventName.SubscriptionUpdated,
  EventName.SubscriptionActivated,
  EventName.SubscriptionTrialing,
  EventName.SubscriptionPastDue,
  EventName.SubscriptionPaused,
  EventName.SubscriptionCanceled,
  EventName.SubscriptionResumed
]);

export async function POST(request: Request) {
  const paddle = getPaddleClient();
  const webhookSecret = getPaddleWebhookSecret();
  if (!paddle || !webhookSecret) {
    // Fails closed: never processes an unverifiable event. Paddle
    // retries a non-2xx response on its own schedule.
    return new Response('Billing is not configured.', { status: 503 });
  }

  const signature = request.headers.get('paddle-signature');
  if (!signature) {
    return new Response('Missing Paddle signature.', { status: 400 });
  }

  const rawBody = await request.text();

  let event: EventEntity;
  try {
    // Verifies the signature AND parses the event in one call — throws
    // on an invalid/malformed signature. Never logs the payload or the
    // signature — an invalid signature could be a misconfigured secret,
    // a replayed/tampered request, or simply sandbox noise; none of
    // that is safe or useful to log verbatim.
    event = await paddle.webhooks.unmarshal(rawBody, webhookSecret, signature);
  } catch (error) {
    // Classifies WHY, for Vercel logs only — see
    // webhook-signature-diagnostics.ts's own doc comment for exactly
    // how each category was derived from the installed SDK's source.
    // The HTTP response below is deliberately identical for every
    // category: an attacker (or Paddle itself) must never be able to
    // distinguish "timestamp too old" from "wrong secret" from the
    // response alone.
    logWebhookSignatureFailure(classifyWebhookVerificationFailure(error, signature));
    return new Response('Invalid signature.', { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) {
    return new Response('Billing is not configured.', { status: 503 });
  }

  // Idempotency: a prior successful processing of this exact event id
  // already has a row here — Paddle retries any non-2xx response, and
  // can also simply redeliver, so this is expected and safe to
  // short-circuit without redoing any work or any Paddle API call.
  //
  // Fail closed on the lookup itself: if we can't determine whether
  // this event was already processed, we must not guess. Returning 500
  // costs nothing (subscription synchronization is idempotent, so a
  // Paddle retry that turns out to be a genuine re-delivery is always
  // safe to reprocess) but silently proceeding as "not a duplicate"
  // could double up externally-visible side effects in a future event
  // handler.
  const { data: existingEvent, error: lookupError } = await supabase
    .from('paddle_webhook_events')
    .select('paddle_event_id')
    .eq('paddle_event_id', event.eventId)
    .maybeSingle();

  if (lookupError) {
    console.error('[paddle-webhook] ledger lookup failed', { eventId: event.eventId });
    return new Response('Ledger lookup failed.', { status: 500 });
  }

  if (existingEvent) {
    return new Response(null, { status: 200 });
  }

  try {
    await processEvent(supabase, paddle, event);
  } catch {
    // Safe, generic diagnostic only — event type and id are not
    // secrets and are already visible in the Paddle Dashboard; never
    // the raw payload, a customer field, or an exception's full
    // message (which could embed request/response details).
    console.error('[paddle-webhook] processing failed', {
      eventType: event.eventType,
      eventId: event.eventId
    });
    // No ledger row is written on failure, so Paddle's retry
    // reprocesses this event from scratch instead of silently skipping
    // it as "already handled".
    return new Response('Processing failed.', { status: 500 });
  }

  const { error: ledgerError } = await supabase
    .from('paddle_webhook_events')
    .insert({ paddle_event_id: event.eventId, event_type: event.eventType });

  if (ledgerError) {
    // A concurrent delivery of the same event that also just finished
    // processing (both syncs are idempotent, so both produced the same
    // correct result) loses the ledger-insert race here — that one
    // specific error is not a real failure, so it's still safe to
    // acknowledge.
    if (ledgerError.code === UNIQUE_VIOLATION) {
      return new Response(null, { status: 200 });
    }

    // Any other ledger-write failure fails closed: processing already
    // succeeded, but we could not durably record that fact, so this
    // response must not claim success. Paddle will retry; processing is
    // idempotent, so replaying it is always safe.
    console.error('[paddle-webhook] ledger insert failed', { eventId: event.eventId });
    return new Response('Ledger write failed.', { status: 500 });
  }

  return new Response(null, { status: 200 });
}

async function processEvent(
  supabase: SupabaseClient,
  paddle: Paddle,
  event: EventEntity
): Promise<void> {
  if (SUBSCRIPTION_EVENT_TYPES.has(event.eventType)) {
    // Every `subscription.*` event carries the full, authoritative
    // Subscription representation directly in its own payload — Paddle
    // signs the entire body (already verified above), so there is no
    // need for a defensive re-fetch the way some other providers'
    // thinner event shapes require.
    const result = await syncSubscriptionFromPaddle(
      supabase,
      event.data as unknown as Parameters<typeof syncSubscriptionFromPaddle>[1],
      event.occurredAt
    );
    if (!result.ok) throw new Error(result.reason);
    return;
  }

  if (event.eventType === EventName.TransactionCompleted) {
    const transaction = event.data;

    // This app only ever creates subscription-mode transactions (see
    // startCheckout() in src/features/billing/api/service.ts). A
    // "completed" transaction with no subscription id attached is not a
    // state this billing feature can safely acknowledge as handled — it
    // must fail so Paddle retries, never be silently accepted (which
    // would record the event as processed with nothing actually
    // synchronized).
    if (!transaction.subscriptionId) {
      throw new Error('transaction_completed_missing_subscription');
    }

    const subscription = await paddle.subscriptions.get(transaction.subscriptionId);
    const result = await syncSubscriptionFromPaddle(
      supabase,
      subscription,
      event.occurredAt,
      transaction.id
    );
    if (!result.ok) throw new Error(result.reason);

    await markCheckoutAttemptCompleted(supabase, transaction.id);
    return;
  }

  // Every other event type is acknowledged (2xx) without action — this
  // webhook endpoint only needs to exist for the event types above; the
  // Paddle Dashboard's notification destination should select the same
  // set (see this file's own header comment), but an unexpected extra
  // event type must never fail the request.
  return;
}

/**
 * Best-effort: marks the `billing_checkout_attempts` row this
 * transaction belongs to as 'completed', so a future
 * `claimCheckoutAttempt()` never mistakes it for still-pending. Never
 * throws — a failure here must not turn an already-successfully-synced
 * subscription into a reprocessed webhook (`claimCheckoutAttempt()`
 * also marks this same row 'completed' itself the next time anyone
 * claims for this business, so this update is redundant, never
 * load-bearing).
 */
async function markCheckoutAttemptCompleted(
  supabase: SupabaseClient,
  paddleTransactionId: string
): Promise<void> {
  try {
    await supabase
      .from('billing_checkout_attempts')
      .update({ status: 'completed' })
      .eq('paddle_transaction_id', paddleTransactionId);
  } catch {
    // Intentionally swallowed — see doc comment above.
  }
}
