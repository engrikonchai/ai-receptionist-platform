import type { SupabaseClient } from '@supabase/supabase-js';
import type { BusinessSubscriptionStatus } from '@/lib/supabase/database.types';

const SYNC_RPC = 'sync_business_subscription';

/**
 * The minimal shape this module actually reads — satisfied by BOTH the
 * Paddle Node SDK's `Subscription` entity (returned by
 * `paddle.subscriptions.get()`) and its `SubscriptionNotification`
 * entity (embedded directly in every `subscription.*` webhook event).
 * The two have identical field names for everything used here, so one
 * sync function serves both call sites without a defensive re-fetch:
 * Paddle signs the entire webhook payload (verified before this module
 * ever runs — see src/app/api/paddle/webhook/route.ts), so the object
 * already inside a `subscription.*` event is itself authoritative,
 * unlike some other providers' thinner event shapes.
 */
export interface PaddleSubscriptionLike {
  id: string;
  status: string;
  customerId: string;
  createdAt: string;
  canceledAt: string | null;
  customData: Record<string, unknown> | null;
  currentBillingPeriod: { startsAt: string; endsAt: string } | null;
  scheduledChange: { action: string } | null;
  items: Array<{
    price: { id: string } | null;
    trialDates: { startsAt: string; endsAt: string } | null;
  }>;
}

/**
 * The single place a Paddle Subscription object becomes a
 * `business_subscriptions` row. Called from the webhook handler
 * (src/app/api/paddle/webhook/route.ts) for every subscription-related
 * event, and (via a fetched `Subscription`) for `transaction.completed`.
 *
 * `subscription.customData.business_id`/`billing_generation` are
 * trusted because this app itself is the only party that ever sets them
 * (at transaction creation — see startCheckout() in
 * src/features/billing/api/service.ts) — Paddle merely echoes them back
 * unmodified onto the subscription the transaction produced. A webhook
 * payload can never inject or override them.
 *
 * `billing_generation` (a strictly monotonic integer copied from the
 * claimed `billing_checkout_attempts` row) is the PRIMARY deterministic
 * ordering key `sync_business_subscription` uses to decide whether this
 * update may replace a DIFFERENT subscription's state — Paddle's own
 * `createdAt` is only a fallback for subscriptions that predate this
 * column. `eventOccurredAt` (this specific webhook event's own
 * `occurred_at`) is separately used to guard against Paddle delivering
 * two events for the SAME subscription out of order — Paddle does not
 * guarantee webhook delivery order. Pass `null` (never a fabricated
 * "now") when this call is a best-effort proactive sync outside of an
 * actual webhook delivery (see claimCheckoutAttempt() in
 * checkout-attempts.ts) — a real webhook's own `occurred_at` must
 * always win over a synthetic timestamp, and a stored `null` is what
 * lets it.
 *
 * Trial dates live on the subscription's first item, not the
 * subscription object itself (Paddle only supports a single-item
 * subscription for this app's one-plan model, so `items[0]` is always
 * the one that matters).
 */
export async function syncSubscriptionFromPaddle(
  supabase: SupabaseClient,
  subscription: PaddleSubscriptionLike,
  eventOccurredAt: string | null,
  latestTransactionId: string | null = null
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const businessId = readStringCustomData(subscription.customData, 'business_id');
  if (!businessId) {
    return { ok: false, reason: 'missing_business_id_custom_data' };
  }

  const billingGeneration = readNumberCustomData(subscription.customData, 'billing_generation');
  const item = subscription.items[0];

  const { error } = await supabase.rpc(SYNC_RPC, {
    p_business_id: businessId,
    p_paddle_customer_id: subscription.customerId,
    p_paddle_subscription_id: subscription.id,
    p_paddle_transaction_id: latestTransactionId,
    p_paddle_subscription_created_at: subscription.createdAt,
    p_paddle_event_occurred_at: eventOccurredAt,
    p_billing_generation: billingGeneration,
    p_paddle_price_id: item?.price?.id ?? null,
    p_status: subscription.status as BusinessSubscriptionStatus,
    p_trial_start: item?.trialDates?.startsAt ?? null,
    p_trial_end: item?.trialDates?.endsAt ?? null,
    p_current_period_start: subscription.currentBillingPeriod?.startsAt ?? null,
    p_current_period_end: subscription.currentBillingPeriod?.endsAt ?? null,
    p_cancel_at_period_end: subscription.scheduledChange?.action === 'cancel',
    p_canceled_at: subscription.canceledAt
  });

  if (error) return { ok: false, reason: error.code ?? 'db_error' };
  return { ok: true };
}

function readStringCustomData(
  customData: Record<string, unknown> | null,
  key: string
): string | null {
  const value = customData?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Paddle `custom_data` is real JSON (unlike some providers' string-only metadata), so a number round-trips as a number — still validated defensively rather than trusted blindly. */
function readNumberCustomData(
  customData: Record<string, unknown> | null,
  key: string
): number | null {
  const value = customData?.[key];
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}
