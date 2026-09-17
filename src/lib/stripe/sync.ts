import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BusinessSubscriptionStatus } from '@/lib/supabase/database.types';

const SYNC_RPC = 'sync_business_subscription';

/**
 * The single place a live Stripe Subscription object becomes a
 * `business_subscriptions` row. Called from the webhook handler
 * (src/app/api/stripe/webhook/route.ts) for every subscription-related
 * event — always with a freshly re-fetched Subscription object, never
 * with a webhook payload's own (possibly stale, possibly out-of-order)
 * `data.object` fields. Applying the same current snapshot twice (a
 * duplicate delivery) always converges on the same, correct row.
 *
 * Out-of-order delivery — a delayed webhook from an OLDER subscription
 * a business has since canceled and replaced — is handled by the
 * `sync_business_subscription` Postgres function (see the migration),
 * not here: this function always calls that one atomic
 * `insert ... on conflict ... do update ... where <ordering guard>`
 * statement rather than a non-atomic "read the current row in JS, then
 * decide whether to write." Passing `subscription.created` on every
 * call is what makes that guard possible.
 *
 * `subscription.metadata.business_id` is trusted because this app
 * itself is the only party that ever sets it (at Checkout Session
 * creation — see startCheckout() in src/features/billing/api/service.ts)
 * — Stripe merely echoes it back unmodified. A webhook payload can
 * never inject or override it.
 *
 * `current_period_start`/`current_period_end` live on the
 * subscription's first item, not the subscription object itself, as of
 * this SDK's pinned API version (Stripe moved per-item billing periods
 * in its 2025 "flexible billing" update) — this app only ever creates
 * single-price subscriptions, so `items.data[0]` is always the one that
 * matters.
 */
export async function syncSubscriptionFromStripe(
  supabase: SupabaseClient,
  stripe: Stripe,
  subscriptionId: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  const businessId = subscription.metadata?.business_id;
  if (!businessId) {
    return { ok: false, reason: 'missing_business_id_metadata' };
  }

  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const item = subscription.items.data[0];
  const priceId = item?.price?.id ?? null;

  const { error } = await supabase.rpc(SYNC_RPC, {
    p_business_id: businessId,
    p_stripe_customer_id: customerId,
    p_stripe_subscription_id: subscription.id,
    p_stripe_subscription_created_at: unixToIso(subscription.created),
    p_stripe_price_id: priceId,
    p_status: subscription.status as BusinessSubscriptionStatus,
    p_trial_start: unixToIso(subscription.trial_start),
    p_trial_end: unixToIso(subscription.trial_end),
    p_current_period_start: unixToIso(item?.current_period_start ?? null),
    p_current_period_end: unixToIso(item?.current_period_end ?? null),
    p_cancel_at_period_end: subscription.cancel_at_period_end,
    p_canceled_at: unixToIso(subscription.canceled_at)
  });

  if (error) return { ok: false, reason: error.code ?? 'db_error' };
  return { ok: true };
}

function unixToIso(seconds: number | null | undefined): string | null {
  return typeof seconds === 'number' ? new Date(seconds * 1000).toISOString() : null;
}
