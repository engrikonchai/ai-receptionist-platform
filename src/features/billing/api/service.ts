'use server';

import type { Paddle } from '@paddle/paddle-node-sdk';
import type { BusinessSubscriptionRow } from '@/lib/supabase/database.types';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { getPaddleClient, getPaddleEnvironment, getPaddlePriceId } from '@/lib/paddle/client';
import { claimCheckoutAttempt, recordTransactionId } from './checkout-attempts';
import { verifyActiveBusiness } from './authorize';
import { GENERIC_BILLING_ERROR } from './types';
import { extractPaddleErrorDetails, logCheckoutDiagnostic } from './diagnostics';
import type {
  BillingPlan,
  BillingStatusResult,
  BillingSubscription,
  OpenPortalResult,
  StartCheckoutResult
} from './types';

/**
 * Every column `authenticated` is actually granted SELECT on (see the
 * migration's column-level grant) — deliberately excludes
 * paddle_customer_id/paddle_subscription_id/paddle_transaction_id.
 * `has_paddle_customer` is a generated boolean, never the real id.
 */
const SUBSCRIPTION_DISPLAY_SELECT =
  'status, trial_start, trial_end, current_period_start, current_period_end, cancel_at_period_end, has_paddle_customer';

type SubscriptionDisplayRow = Pick<
  BusinessSubscriptionRow,
  | 'status'
  | 'trial_start'
  | 'trial_end'
  | 'current_period_start'
  | 'current_period_end'
  | 'cancel_at_period_end'
  | 'has_paddle_customer'
>;

/** The Paddle-identifier fields `authenticated` can never select — read only by service-role, only from startCheckout()/openCustomerPortal(), always after verifyActiveBusiness(). See src/lib/supabase/service-role.ts for the documented exception this is. */
type SubscriptionSecretsRow = Pick<
  BusinessSubscriptionRow,
  'status' | 'paddle_customer_id' | 'paddle_subscription_id'
>;

/** A business "has access" for the purpose of preventing a second, redundant Checkout — anything short of that (past_due, paused, canceled, ...) may legitimately start a new one to recover. */
function hasActiveAccess(status: SubscriptionDisplayRow['status']): boolean {
  return status === 'active' || status === 'trialing';
}

function toBillingSubscription(row: SubscriptionDisplayRow): BillingSubscription {
  return {
    status: row.status,
    trialEnd: row.trial_end,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    hasPaddleCustomer: row.has_paddle_customer
  };
}

/**
 * The current catalog price for PADDLE_PRICE_ID, fetched live from
 * Paddle every call — this app never hardcodes an amount or currency
 * into a component. Best-effort: a Paddle API failure here degrades to
 * `null` (the billing page still renders subscription status without
 * pricing) rather than failing the whole page load, since pricing
 * display is secondary to the owner's actual subscription state. Any
 * trial period is configured on this Price in the Paddle Dashboard
 * itself — this app never requests or withholds one.
 */
async function fetchCurrentPlan(paddle: Paddle): Promise<BillingPlan | null> {
  const priceId = getPaddlePriceId();
  if (!priceId) return null;

  try {
    const price = await paddle.prices.get(priceId, { include: ['product'] });
    const amount = Number(price.unitPrice.amount);

    return {
      productName: price.product?.name ?? price.description,
      unitAmount: Number.isFinite(amount) ? amount : null,
      currency: price.unitPrice.currencyCode,
      interval: price.billingCycle?.interval ?? null
    };
  } catch {
    return null;
  }
}

/**
 * Resolves the one Paddle customer that represents this business,
 * server-side only — "create or retrieve," per this billing feature's
 * design. Reuses the id already on file when present; otherwise looks
 * up an existing Paddle customer by the owner's own email (so a
 * previously-abandoned attempt, or a retry after a failed durable
 * write, can never accumulate a second Paddle customer for the same
 * business) before creating a fresh one. Never lets the browser supply
 * or influence a customer id.
 */
async function resolvePaddleCustomerId(
  paddle: Paddle,
  ownerEmail: string,
  existingCustomerId: string | null
): Promise<string> {
  if (existingCustomerId) return existingCustomerId;

  const matches = paddle.customers.list({ email: [ownerEmail], perPage: 1 });
  for await (const customer of matches) {
    return customer.id;
  }

  const created = await paddle.customers.create({ email: ownerEmail });
  return created.id;
}

/**
 * Read-only — the billing page's own data source. Reads only the
 * columns `authenticated` is actually granted (see
 * SUBSCRIPTION_DISPLAY_SELECT) via the normal cookie-scoped, RLS-
 * enforced client — never the service-role key, and never a Paddle
 * customer/subscription/transaction id. Never writes anything;
 * `business_subscriptions` is written exclusively by the verified
 * Paddle webhook handler (src/app/api/paddle/webhook/route.ts) and the
 * checkout/portal actions' own service-role calls in this file.
 */
export async function fetchBillingStatus(businessId: string): Promise<BillingStatusResult> {
  const verified = await verifyActiveBusiness(businessId);
  if (!verified.ok) throw new Error(verified.error);
  const { supabase, businessId: verifiedId } = verified.ctx;

  const environment = getPaddleEnvironment();
  if (!environment) return { status: 'not_configured' };

  const { data: row, error } = await supabase
    .from('business_subscriptions')
    .select(SUBSCRIPTION_DISPLAY_SELECT)
    .eq('business_id', verifiedId)
    .maybeSingle();

  if (error) throw new Error(GENERIC_BILLING_ERROR);

  const paddle = getPaddleClient();
  const plan = paddle ? await fetchCurrentPlan(paddle) : null;

  return {
    status: 'ok',
    plan,
    subscription: row ? toBillingSubscription(row as SubscriptionDisplayRow) : null,
    environment
  };
}

/**
 * Creates a Paddle transaction for this business's one configurable
 * plan (`PADDLE_PRICE_ID`), returning only the transaction id the
 * client needs to open the Paddle.js Checkout overlay
 * (`Paddle.Checkout.open({ transactionId })`) — never a full checkout
 * URL (Paddle's overlay flow doesn't use one) and never any other
 * transaction detail. `business_id` is attached as trusted, server-set
 * `custom_data` — from the already-verified business id, never from
 * anything the browser sent directly — which is what the webhook
 * handler later trusts to resolve which business a subscription
 * belongs to (see src/lib/paddle/sync.ts).
 *
 * Layers of protection against a duplicate/racing Checkout:
 *   1. Refuses outright when the business already has active or
 *      trialing access (business_subscriptions.status).
 *   2. `claimCheckoutAttempt()` — a durable, database-enforced claim on
 *      `billing_checkout_attempts` that closes the race window before
 *      the webhook ever writes a subscription row (see that module's
 *      own doc comment). Two simultaneous calls converge on exactly one
 *      Paddle transaction: only the winning claimer ever calls
 *      `transactions.create()` at all — the Paddle Node SDK has no
 *      request-level idempotency key the way some other providers'
 *      SDKs do, so a losing/concurrent caller is told to retry shortly
 *      rather than risk creating a second transaction.
 *
 * Reuses an existing Paddle customer when this business already has one
 * on file (from a previous subscription, even a canceled one) so a
 * business never accumulates duplicate Paddle customers.
 *
 * This app never requests or withholds a trial itself — Paddle decides
 * trial eligibility per customer from the Price's own configuration in
 * the Paddle Dashboard. `trial_used_at` (recorded by the webhook's own
 * sync, never by this function) is this app's own durable record of
 * what happened, for display only.
 *
 * The claimed attempt's `generation` (a strictly monotonic integer, see
 * checkout-attempts.ts) is embedded as trusted `custom_data` — the
 * deterministic ordering key `sync_business_subscription` uses to
 * decide whether an incoming webhook may replace the current
 * subscription, immune to two different subscriptions ever sharing the
 * same one-second Paddle timestamp.
 *
 * Reads/writes `business_subscriptions`' Paddle-identifier columns and
 * `billing_checkout_attempts` via the service-role key — the documented
 * exception in src/lib/supabase/service-role.ts — always scoped to
 * `verifiedId`, never a caller-supplied business id.
 */
export async function startCheckout(businessId: string): Promise<StartCheckoutResult> {
  const verified = await verifyActiveBusiness(businessId);
  if (!verified.ok) return { status: 'error', error: verified.error };
  const { businessId: verifiedId, user } = verified.ctx;

  const paddle = getPaddleClient();
  const priceId = getPaddlePriceId();
  if (!paddle || !priceId) return { status: 'not_configured' };

  const service = createSupabaseServiceRoleClient();
  if (!service) return { status: 'not_configured' };

  const { data: row, error: loadError } = await service
    .from('business_subscriptions')
    .select('status, paddle_customer_id, paddle_subscription_id')
    .eq('business_id', verifiedId)
    .maybeSingle();

  if (loadError) return { status: 'error', error: GENERIC_BILLING_ERROR };

  const existing = row as SubscriptionSecretsRow | null;
  if (existing && hasActiveAccess(existing.status)) {
    return { status: 'already_subscribed' };
  }

  if (!user.email) return { status: 'error', error: GENERIC_BILLING_ERROR };

  const claim = await claimCheckoutAttempt(service, paddle, verifiedId);
  switch (claim.kind) {
    case 'retry':
      return { status: 'error', error: GENERIC_BILLING_ERROR };
    case 'reuse':
      return { status: 'ok', transactionId: claim.transactionId };
    case 'already_subscribed':
      return { status: 'already_subscribed' };
    case 'processing':
      return { status: 'processing' };
  }
  // claim.kind is now narrowed to 'new' — this call, and only this
  // call, may create a Paddle transaction.

  let customerId: string;
  try {
    customerId = await resolvePaddleCustomerId(
      paddle,
      user.email,
      existing?.paddle_customer_id ?? null
    );
  } catch (error) {
    logCheckoutDiagnostic('resolve_customer', extractPaddleErrorDetails(error));
    return { status: 'error', error: GENERIC_BILLING_ERROR };
  }

  let transaction: Awaited<ReturnType<Paddle['transactions']['create']>>;
  try {
    transaction = await paddle.transactions.create({
      items: [{ priceId, quantity: 1 }],
      customerId,
      customData: { business_id: verifiedId, billing_generation: claim.generation }
    });
  } catch (error) {
    logCheckoutDiagnostic('create_transaction', extractPaddleErrorDetails(error));
    return { status: 'error', error: GENERIC_BILLING_ERROR };
  }

  // The transaction is valid and usable regardless of whether this
  // write succeeds — recordTransactionId()'s typed result exists so a
  // FUTURE claim (a second tab, a retry) can tell the DB never
  // durably recorded it and report `retry` rather than falsely
  // reusing an unrecorded id. See checkout-attempts.ts. Its failure is
  // only ever logged, never surfaced to the caller: the transaction
  // Paddle just created is still real and usable either way.
  const recordResult = await recordTransactionId(service, claim.attemptId, transaction.id);
  if (!recordResult.ok) {
    logCheckoutDiagnostic('record_transaction_id', { supabaseErrorCode: recordResult.reason });
  }
  return { status: 'ok', transactionId: transaction.id };
}

/**
 * Opens a Paddle Customer Portal session for this business's own Paddle
 * customer — never for a customer id the caller supplied, only the one
 * this server already has on file for the verified business. Reads
 * `paddle_customer_id`/`paddle_subscription_id` via the service-role key
 * (the same documented exception `startCheckout()` uses), since
 * `authenticated` has no SELECT grant on those columns at all.
 */
export async function openCustomerPortal(businessId: string): Promise<OpenPortalResult> {
  const verified = await verifyActiveBusiness(businessId);
  if (!verified.ok) return { status: 'error', error: verified.error };
  const { businessId: verifiedId } = verified.ctx;

  const paddle = getPaddleClient();
  if (!paddle) return { status: 'not_configured' };

  const service = createSupabaseServiceRoleClient();
  if (!service) return { status: 'not_configured' };

  const { data: row, error: loadError } = await service
    .from('business_subscriptions')
    .select('paddle_customer_id, paddle_subscription_id')
    .eq('business_id', verifiedId)
    .maybeSingle();

  if (loadError) return { status: 'error', error: GENERIC_BILLING_ERROR };

  const record = row as SubscriptionSecretsRow | null;
  const customerId = record?.paddle_customer_id;
  if (!customerId) return { status: 'no_customer' };

  try {
    const session = await paddle.customerPortalSessions.create(
      customerId,
      record?.paddle_subscription_id ? [record.paddle_subscription_id] : []
    );
    return { status: 'ok', url: session.urls.general.overview };
  } catch {
    return { status: 'error', error: GENERIC_BILLING_ERROR };
  }
}
