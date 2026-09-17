'use server';

import type Stripe from 'stripe';
import type { BusinessSubscriptionRow } from '@/lib/supabase/database.types';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { getStripeClient, getStripePriceId, isStripeConfigured } from '@/lib/stripe/client';
import { getSiteUrl } from '@/lib/site-url';
import { claimCheckoutAttempt, recordCheckoutSession } from './checkout-attempts';
import { verifyActiveBusiness } from './authorize';
import { GENERIC_BILLING_ERROR } from './types';
import type {
  BillingPlan,
  BillingStatusResult,
  BillingSubscription,
  OpenPortalResult,
  StartCheckoutResult
} from './types';

const BILLING_PATH_QUERY = (checkout: 'success' | 'canceled') =>
  `/dashboard/billing?checkout=${checkout}`;

const TRIAL_PERIOD_DAYS = 14;

/**
 * Every column `authenticated` is actually granted SELECT on (see the
 * migration's column-level grant) — deliberately excludes
 * stripe_customer_id/stripe_subscription_id. `has_stripe_customer` is a
 * generated boolean, never the real id.
 */
const SUBSCRIPTION_DISPLAY_SELECT =
  'status, trial_start, trial_end, current_period_start, current_period_end, cancel_at_period_end, has_stripe_customer';

type SubscriptionDisplayRow = Pick<
  BusinessSubscriptionRow,
  | 'status'
  | 'trial_start'
  | 'trial_end'
  | 'current_period_start'
  | 'current_period_end'
  | 'cancel_at_period_end'
  | 'has_stripe_customer'
>;

/** The Stripe-identifier fields `authenticated` can never select — read only by service-role, only from startCheckout()/openCustomerPortal(), always after verifyActiveBusiness(). See src/lib/supabase/service-role.ts for the documented exception this is. */
type SubscriptionSecretsRow = Pick<
  BusinessSubscriptionRow,
  'status' | 'stripe_customer_id' | 'trial_used_at'
>;

/** A business "has access" for the purpose of preventing a second, redundant Checkout — anything short of that (past_due, incomplete, canceled, ...) may legitimately start a new one to recover. */
function hasActiveAccess(status: SubscriptionDisplayRow['status']): boolean {
  return status === 'active' || status === 'trialing';
}

function toBillingSubscription(row: SubscriptionDisplayRow): BillingSubscription {
  return {
    status: row.status,
    trialEnd: row.trial_end,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    hasStripeCustomer: row.has_stripe_customer
  };
}

/**
 * The current catalog price for STRIPE_PRICE_ID, fetched live from
 * Stripe every call — this app never hardcodes an amount or currency
 * into a component. Best-effort: a Stripe API failure here degrades to
 * `null` (the billing page still renders subscription status without
 * pricing) rather than failing the whole page load, since pricing
 * display is secondary to the owner's actual subscription state.
 */
async function fetchCurrentPlan(stripe: Stripe): Promise<BillingPlan | null> {
  const priceId = getStripePriceId();
  if (!priceId) return null;

  try {
    const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
    const product = price.product;
    const productName =
      typeof product === 'string' || ('deleted' in product && product.deleted)
        ? 'Subscription'
        : product.name;

    return {
      productName,
      unitAmount: price.unit_amount,
      currency: price.currency,
      interval: price.recurring?.interval ?? null
    };
  } catch {
    return null;
  }
}

/**
 * Read-only — the billing page's own data source. Reads only the
 * columns `authenticated` is actually granted (see
 * SUBSCRIPTION_DISPLAY_SELECT) via the normal cookie-scoped, RLS-
 * enforced client — never the service-role key, and never a Stripe
 * customer/subscription id. Never writes anything;
 * `business_subscriptions` is written exclusively by the verified
 * Stripe webhook handler (src/app/api/stripe/webhook/route.ts) and the
 * checkout/portal actions' own service-role calls in this file.
 */
export async function fetchBillingStatus(businessId: string): Promise<BillingStatusResult> {
  const verified = await verifyActiveBusiness(businessId);
  if (!verified.ok) throw new Error(verified.error);
  const { supabase, businessId: verifiedId } = verified.ctx;

  if (!isStripeConfigured()) return { status: 'not_configured' };

  const { data: row, error } = await supabase
    .from('business_subscriptions')
    .select(SUBSCRIPTION_DISPLAY_SELECT)
    .eq('business_id', verifiedId)
    .maybeSingle();

  if (error) throw new Error(GENERIC_BILLING_ERROR);

  const stripe = getStripeClient();
  const plan = stripe ? await fetchCurrentPlan(stripe) : null;

  return {
    status: 'ok',
    plan,
    subscription: row ? toBillingSubscription(row as SubscriptionDisplayRow) : null
  };
}

/**
 * Starts a Stripe Checkout Session in subscription mode. `business_id`
 * is attached as Checkout/subscription metadata — set here, server-side,
 * from the already-verified business id, never from anything the
 * browser sent directly — which is what the webhook handler later
 * trusts to resolve which business a subscription belongs to (see
 * src/lib/stripe/sync.ts).
 *
 * Three layers of protection against a duplicate/racing Checkout:
 *   1. Refuses outright when the business already has active or
 *      trialing access (business_subscriptions.status).
 *   2. `claimCheckoutAttempt()` — a durable, database-enforced claim on
 *      `billing_checkout_attempts` that closes the race window before
 *      the webhook ever writes a subscription row (see that module's
 *      own doc comment). Two simultaneous calls converge on exactly one
 *      Stripe Checkout Session.
 *   3. The claimed attempt's id is passed to Stripe as
 *      `checkout.sessions.create`'s own idempotency key, so even a
 *      literal HTTP-level retry of the same claimed attempt can never
 *      create two Stripe-side sessions.
 *
 * Reuses an existing Stripe customer when this business already has one
 * on file (from a previous subscription, even a canceled one) so a
 * business never accumulates duplicate Stripe customers.
 *
 * Grants a 14-day trial only when `trial_used_at` has never been set
 * for this business — canceling and resubscribing, a subscription-id
 * change, a stale/duplicate webhook, or a concurrent Checkout attempt
 * can never grant a second trial (see the `sync_business_subscription`
 * Postgres function's own coalesce guard for the durable, immutable
 * half of this guarantee). An abandoned Checkout Session — one where
 * this trial-eligible session was created but never completed — does
 * NOT consume the trial: `trial_used_at` is set only by the webhook's
 * subscription sync, which never runs for a session nobody completed.
 *
 * Reads/writes `business_subscriptions`' Stripe-identifier columns and
 * `billing_checkout_attempts` via the service-role key — the documented
 * exception in src/lib/supabase/service-role.ts — always scoped to
 * `verifiedId`, never a caller-supplied business id.
 */
export async function startCheckout(businessId: string): Promise<StartCheckoutResult> {
  const verified = await verifyActiveBusiness(businessId);
  if (!verified.ok) return { status: 'error', error: verified.error };
  const { businessId: verifiedId } = verified.ctx;

  const stripe = getStripeClient();
  const priceId = getStripePriceId();
  if (!stripe || !priceId) return { status: 'not_configured' };

  const service = createSupabaseServiceRoleClient();
  if (!service) return { status: 'not_configured' };

  const { data: row, error: loadError } = await service
    .from('business_subscriptions')
    .select('status, stripe_customer_id, trial_used_at')
    .eq('business_id', verifiedId)
    .maybeSingle();

  if (loadError) return { status: 'error', error: GENERIC_BILLING_ERROR };

  const existing = row as SubscriptionSecretsRow | null;
  if (existing && hasActiveAccess(existing.status)) {
    return { status: 'already_subscribed' };
  }

  const claim = await claimCheckoutAttempt(service, stripe, verifiedId);
  if (claim.kind === 'retry') {
    return { status: 'error', error: GENERIC_BILLING_ERROR };
  }
  if (claim.kind === 'reuse') {
    return { status: 'ok', url: claim.url };
  }

  const siteUrl = getSiteUrl();
  const eligibleForTrial = !existing?.trial_used_at;

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        customer: existing?.stripe_customer_id ?? undefined,
        subscription_data: {
          ...(eligibleForTrial ? { trial_period_days: TRIAL_PERIOD_DAYS } : {}),
          metadata: { business_id: verifiedId }
        },
        metadata: { business_id: verifiedId },
        success_url: `${siteUrl}${BILLING_PATH_QUERY('success')}`,
        cancel_url: `${siteUrl}${BILLING_PATH_QUERY('canceled')}`
      },
      { idempotencyKey: claim.attemptId }
    );

    if (!session.url) return { status: 'error', error: GENERIC_BILLING_ERROR };

    await recordCheckoutSession(service, claim.attemptId, session.id);
    return { status: 'ok', url: session.url };
  } catch {
    return { status: 'error', error: GENERIC_BILLING_ERROR };
  }
}

/**
 * Opens a Stripe Billing Portal session for this business's own Stripe
 * customer — never for a customer id the caller supplied, only the one
 * this server already has on file for the verified business. Reads
 * `stripe_customer_id` via the service-role key (the same documented
 * exception `startCheckout()` uses), since `authenticated` has no SELECT
 * grant on that column at all.
 */
export async function openCustomerPortal(businessId: string): Promise<OpenPortalResult> {
  const verified = await verifyActiveBusiness(businessId);
  if (!verified.ok) return { status: 'error', error: verified.error };
  const { businessId: verifiedId } = verified.ctx;

  const stripe = getStripeClient();
  if (!stripe) return { status: 'not_configured' };

  const service = createSupabaseServiceRoleClient();
  if (!service) return { status: 'not_configured' };

  const { data: row, error: loadError } = await service
    .from('business_subscriptions')
    .select('stripe_customer_id')
    .eq('business_id', verifiedId)
    .maybeSingle();

  if (loadError) return { status: 'error', error: GENERIC_BILLING_ERROR };

  const customerId = (row as Pick<BusinessSubscriptionRow, 'stripe_customer_id'> | null)
    ?.stripe_customer_id;
  if (!customerId) return { status: 'no_customer' };

  const siteUrl = getSiteUrl();

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${siteUrl}/dashboard/billing`
    });
    return { status: 'ok', url: session.url };
  } catch {
    return { status: 'error', error: GENERIC_BILLING_ERROR };
  }
}
