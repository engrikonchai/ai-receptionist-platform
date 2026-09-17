import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { getStripeClient, getStripeWebhookSecret } from '@/lib/stripe/client';
import { syncSubscriptionFromStripe } from '@/lib/stripe/sync';

/**
 * Stripe's own webhook signing requires the exact raw request bytes —
 * re-serializing a parsed JSON body would change whitespace/key order
 * and fail signature verification. Next.js Route Handlers give the raw
 * body via `request.text()` by default (no special config needed, only
 * a concern in the older Pages Router).
 */

const UNIQUE_VIOLATION = '23505';

/**
 * Resolves a Stripe id reference (Stripe SDK types every relation as
 * `string | ExpandedObject | null` depending on whether the caller
 * asked to expand it) to its plain id — this app never expands these
 * relations, so the string branch is the one actually hit, but staying
 * correct for both keeps this safe if a future change adds an expand.
 */
function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

export async function POST(request: Request) {
  const stripe = getStripeClient();
  const webhookSecret = getStripeWebhookSecret();
  if (!stripe || !webhookSecret) {
    // Fails closed: never processes an unverifiable event. Stripe
    // retries a non-2xx response on its own schedule.
    return new Response('Billing is not configured.', { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing Stripe signature.', { status: 400 });
  }

  const rawBody = await request.text();

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch {
    // Never logs the payload or the signature — an invalid signature
    // could be a misconfigured secret, a replayed/tampered request, or
    // simply Stripe test-mode noise; none of that is safe or useful to
    // log verbatim.
    return new Response('Invalid signature.', { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) {
    return new Response('Billing is not configured.', { status: 503 });
  }

  // Idempotency: a prior successful processing of this exact event id
  // already has a row here — Stripe retries any non-2xx response, and
  // can also simply redeliver, so this is expected and safe to
  // short-circuit without redoing any work or any Stripe API call.
  //
  // Fail closed on the lookup itself: if we can't determine whether
  // this event was already processed, we must not guess. Returning 500
  // costs nothing (subscription synchronization is idempotent, so a
  // Stripe retry that turns out to be a genuine re-delivery is always
  // safe to reprocess) but silently proceeding as "not a duplicate"
  // could double up externally-visible side effects in a future event
  // handler.
  const { data: existingEvent, error: lookupError } = await supabase
    .from('stripe_webhook_events')
    .select('stripe_event_id')
    .eq('stripe_event_id', event.id)
    .maybeSingle();

  if (lookupError) {
    console.error('[stripe-webhook] ledger lookup failed', { eventId: event.id });
    return new Response('Ledger lookup failed.', { status: 500 });
  }

  if (existingEvent) {
    return new Response(null, { status: 200 });
  }

  try {
    await processEvent(supabase, stripe, event);
  } catch {
    // Safe, generic diagnostic only — event type and id are not
    // secrets and are already visible in the Stripe Dashboard; never
    // the raw payload, a customer field, or an exception's full
    // message (which could embed request/response details).
    console.error('[stripe-webhook] processing failed', {
      eventType: event.type,
      eventId: event.id
    });
    // No ledger row is written on failure, so Stripe's retry
    // reprocesses this event from scratch instead of silently skipping
    // it as "already handled".
    return new Response('Processing failed.', { status: 500 });
  }

  const { error: ledgerError } = await supabase
    .from('stripe_webhook_events')
    .insert({ stripe_event_id: event.id, event_type: event.type });

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
    // response must not claim success. Stripe will retry; processing is
    // idempotent, so replaying it is always safe.
    console.error('[stripe-webhook] ledger insert failed', { eventId: event.id });
    return new Response('Ledger write failed.', { status: 500 });
  }

  return new Response(null, { status: 200 });
}

async function processEvent(
  supabase: SupabaseClient,
  stripe: Stripe,
  event: Stripe.Event
): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const subscriptionId = idOf(session.subscription);

      // This app only ever creates subscription-mode Checkout Sessions
      // (see startCheckout() in src/features/billing/api/service.ts). A
      // "completed" subscription-mode session with no subscription id
      // attached is not a state this billing feature can safely
      // acknowledge as handled — it must fail so Stripe retries, never
      // be silently accepted (which would record the event as
      // processed with nothing actually synchronized).
      if (session.mode === 'subscription' && !subscriptionId) {
        throw new Error('checkout_session_missing_subscription');
      }

      if (subscriptionId) {
        await syncOrThrow(supabase, stripe, subscriptionId);
        await markCheckoutAttemptCompleted(supabase, session.id);
      }
      return;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      await syncOrThrow(supabase, stripe, event.data.object.id);
      return;
    }

    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const subscriptionId = idOf(event.data.object.parent?.subscription_details?.subscription);
      // Not every invoice belongs to a subscription (e.g. a one-off
      // invoice item) — nothing to synchronize for those, and that is a
      // legitimate, successfully-acknowledged no-op (unlike a
      // subscription-mode checkout.session.completed missing its
      // subscription, which is never legitimate for this app).
      if (subscriptionId) {
        await syncOrThrow(supabase, stripe, subscriptionId);
      }
      return;
    }

    default:
      // Every other event type is acknowledged (2xx) without action —
      // this webhook endpoint only needs to exist for the event types
      // above; Stripe Dashboard event selection should match, but an
      // unexpected extra event type must never fail the request.
      return;
  }
}

/**
 * `syncSubscriptionFromStripe()` always re-fetches the live Subscription
 * object rather than trusting this event's own payload fields — the
 * one thing that makes duplicate delivery safe (see that function's own
 * doc comment in src/lib/stripe/sync.ts). Out-of-order delivery safety
 * comes from the `sync_business_subscription` Postgres function's own
 * atomic ordering guard, not from anything here.
 */
async function syncOrThrow(
  supabase: SupabaseClient,
  stripe: Stripe,
  subscriptionId: string
): Promise<void> {
  const result = await syncSubscriptionFromStripe(supabase, stripe, subscriptionId);
  if (!result.ok) {
    throw new Error(result.reason);
  }
}

/**
 * Best-effort: marks the `billing_checkout_attempts` row this Checkout
 * Session belongs to as 'completed', so a future `claimCheckoutAttempt()`
 * never mistakes it for still-pending. Never throws — a failure here
 * must not turn an already-successfully-synced subscription into a
 * reprocessed webhook (`claimCheckoutAttempt()` also marks this same row
 * 'completed' itself the next time anyone claims for this business, so
 * this update is redundant, never load-bearing).
 */
async function markCheckoutAttemptCompleted(
  supabase: SupabaseClient,
  stripeCheckoutSessionId: string
): Promise<void> {
  try {
    await supabase
      .from('billing_checkout_attempts')
      .update({ status: 'completed' })
      .eq('stripe_checkout_session_id', stripeCheckoutSessionId);
  } catch {
    // Intentionally swallowed — see doc comment above.
  }
}
