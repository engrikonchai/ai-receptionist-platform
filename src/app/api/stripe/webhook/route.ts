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
  const { data: existingEvent } = await supabase
    .from('stripe_webhook_events')
    .select('stripe_event_id')
    .eq('stripe_event_id', event.id)
    .maybeSingle();

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

  // A concurrent delivery of the same event that also just finished
  // processing (both upserts are idempotent, so both produced the same
  // correct result) loses the ledger-insert race here — that's fine,
  // not a real conflict.
  if (ledgerError && ledgerError.code !== UNIQUE_VIOLATION) {
    console.error('[stripe-webhook] ledger insert failed', { eventId: event.id });
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
      const subscriptionId = idOf(event.data.object.subscription);
      if (subscriptionId) {
        await syncOrThrow(supabase, stripe, subscriptionId);
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
      // invoice item) — nothing to synchronize for those.
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
 * one thing that makes duplicate and out-of-order delivery safe (see
 * that function's own doc comment in src/lib/stripe/sync.ts).
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
