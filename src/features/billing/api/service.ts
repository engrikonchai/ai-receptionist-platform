'use server';

import type Stripe from 'stripe';
import type { BusinessSubscriptionRow } from '@/lib/supabase/database.types';
import { getStripeClient, getStripePriceId, isStripeConfigured } from '@/lib/stripe/client';
import { getSiteUrl } from '@/lib/site-url';
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

const SUBSCRIPTION_SELECT =
  'status, trial_start, trial_end, current_period_start, current_period_end, cancel_at_period_end, stripe_customer_id';

type SubscriptionSelectRow = Pick<
  BusinessSubscriptionRow,
  | 'status'
  | 'trial_start'
  | 'trial_end'
  | 'current_period_start'
  | 'current_period_end'
  | 'cancel_at_period_end'
  | 'stripe_customer_id'
>;

/** A business "has access" for the purpose of preventing a second, redundant Checkout — anything short of that (past_due, incomplete, canceled, ...) may legitimately start a new one to recover. */
function hasActiveAccess(status: SubscriptionSelectRow['status']): boolean {
  return status === 'active' || status === 'trialing';
}

function toBillingSubscription(row: SubscriptionSelectRow): BillingSubscription {
  return {
    status: row.status,
    trialEnd: row.trial_end,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    hasStripeCustomer: Boolean(row.stripe_customer_id)
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
 * Read-only — the billing page's own data source. Never writes
 * anything; `business_subscriptions` is written exclusively by the
 * verified Stripe webhook handler (src/app/api/stripe/webhook/route.ts),
 * which is what "Dashboard users must not directly insert, update or
 * delete subscription rows" actually means in practice here: this
 * function (and every other one in this file) simply never attempts a
 * write, on top of RLS denying it outright if it tried.
 */
export async function fetchBillingStatus(businessId: string): Promise<BillingStatusResult> {
  const verified = await verifyActiveBusiness(businessId);
  if (!verified.ok) throw new Error(verified.error);
  const { supabase, businessId: verifiedId } = verified.ctx;

  if (!isStripeConfigured()) return { status: 'not_configured' };

  const { data: row, error } = await supabase
    .from('business_subscriptions')
    .select(SUBSCRIPTION_SELECT)
    .eq('business_id', verifiedId)
    .maybeSingle();

  if (error) throw new Error(GENERIC_BILLING_ERROR);

  const stripe = getStripeClient();
  const plan = stripe ? await fetchCurrentPlan(stripe) : null;

  return {
    status: 'ok',
    plan,
    subscription: row ? toBillingSubscription(row as SubscriptionSelectRow) : null
  };
}

/**
 * Starts a Stripe Checkout Session in subscription mode with a 14-day
 * trial. `business_id` is attached as Checkout/subscription metadata —
 * set here, server-side, from the already-verified business id, never
 * from anything the browser sent directly — which is what the webhook
 * handler later trusts to resolve which business a subscription
 * belongs to (see src/lib/stripe/sync.ts).
 *
 * Reuses an existing Stripe customer when this business already has
 * one on file (from a previous subscription, even a canceled one) so a
 * business never accumulates duplicate Stripe customers. Refuses to
 * start a second Checkout when the business already has active or
 * trialing access.
 */
export async function startCheckout(businessId: string): Promise<StartCheckoutResult> {
  const verified = await verifyActiveBusiness(businessId);
  if (!verified.ok) return { status: 'error', error: verified.error };
  const { supabase, businessId: verifiedId } = verified.ctx;

  const stripe = getStripeClient();
  const priceId = getStripePriceId();
  if (!stripe || !priceId) return { status: 'not_configured' };

  const { data: row, error: loadError } = await supabase
    .from('business_subscriptions')
    .select('status, stripe_customer_id')
    .eq('business_id', verifiedId)
    .maybeSingle();

  if (loadError) return { status: 'error', error: GENERIC_BILLING_ERROR };

  const existing = row as Pick<BusinessSubscriptionRow, 'status' | 'stripe_customer_id'> | null;
  if (existing && hasActiveAccess(existing.status)) {
    return { status: 'already_subscribed' };
  }

  const siteUrl = getSiteUrl();

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer: existing?.stripe_customer_id ?? undefined,
      subscription_data: {
        trial_period_days: 14,
        metadata: { business_id: verifiedId }
      },
      metadata: { business_id: verifiedId },
      success_url: `${siteUrl}${BILLING_PATH_QUERY('success')}`,
      cancel_url: `${siteUrl}${BILLING_PATH_QUERY('canceled')}`
    });

    if (!session.url) return { status: 'error', error: GENERIC_BILLING_ERROR };
    return { status: 'ok', url: session.url };
  } catch {
    return { status: 'error', error: GENERIC_BILLING_ERROR };
  }
}

/**
 * Opens a Stripe Billing Portal session for this business's own Stripe
 * customer — never for a customer id the caller supplied, only the one
 * this server already has on file for the verified business.
 */
export async function openCustomerPortal(businessId: string): Promise<OpenPortalResult> {
  const verified = await verifyActiveBusiness(businessId);
  if (!verified.ok) return { status: 'error', error: verified.error };
  const { supabase, businessId: verifiedId } = verified.ctx;

  const stripe = getStripeClient();
  if (!stripe) return { status: 'not_configured' };

  const { data: row, error: loadError } = await supabase
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
