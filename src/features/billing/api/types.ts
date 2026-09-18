import type { BusinessSubscriptionStatus } from '@/lib/supabase/database.types';

export type { BusinessSubscriptionStatus };

/**
 * Shared, exact error copy for the two authorization failure modes
 * every billing query/action can hit (see `authorize.ts`) — same
 * convention and same copy as every other feature's api/types.ts.
 */
export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';
export const NO_BUSINESS_ACCESS_MESSAGE =
  "We couldn't find that business, or you don't have access to it.";

/** Returned when PADDLE_API_KEY / PADDLE_ENVIRONMENT / PADDLE_PRICE_ID isn't set — a controlled, distinct state from "no subscription yet" or a genuine load failure. */
export const BILLING_NOT_CONFIGURED_MESSAGE = 'Billing is not configured yet.';
export const GENERIC_BILLING_ERROR = 'Something went wrong. Please try again.';
export const ALREADY_SUBSCRIBED_MESSAGE = 'This business already has an active subscription.';
export const NO_PADDLE_CUSTOMER_MESSAGE = 'Start a subscription before managing billing.';

/** The current catalog price for PADDLE_PRICE_ID — fetched live from Paddle, never hardcoded. */
export type BillingPlan = {
  productName: string;
  /** Smallest currency unit (e.g. cents) — format with the matching `currency` client-side. `null` for a price with no fixed unit amount. */
  unitAmount: number | null;
  currency: string;
  /** e.g. 'month' — `null` for a one-off (non-recurring) price, which this app never actually creates but the type stays honest. */
  interval: string | null;
};

/** The business's own subscription record, mapped from `business_subscriptions` — never includes the raw Paddle customer/subscription/transaction id. */
export type BillingSubscription = {
  status: BusinessSubscriptionStatus;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** Whether a Paddle customer exists yet — gates the "Manage billing" action without ever exposing the id itself. */
  hasPaddleCustomer: boolean;
};

export type BillingStatusResult =
  | { status: 'not_configured' }
  | {
      status: 'ok';
      plan: BillingPlan | null;
      subscription: BillingSubscription | null;
      /** Which Paddle account this data came from — drives Paddle.js's own `environment` and the "Sandbox/Test Mode" label (src/features/billing/components/billing-view.tsx). Never a secret; safe to render. */
      environment: 'sandbox' | 'production';
    };

export type StartCheckoutResult =
  | { status: 'not_configured' }
  | { status: 'already_subscribed' }
  /** A transaction already succeeded at Paddle, but its subscription hasn't finished synchronizing yet — never a second Checkout; the billing page will pick up the confirmed subscription once a webhook (or a later status refetch) catches up. */
  | { status: 'processing' }
  | { status: 'error'; error: string }
  /** Only the Paddle transaction id — the client opens the Paddle.js overlay with it (`Paddle.Checkout.open({ transactionId })`); never a full checkout URL, and never anything else about the transaction. */
  | { status: 'ok'; transactionId: string };

export type OpenPortalResult =
  | { status: 'not_configured' }
  | { status: 'no_customer' }
  | { status: 'error'; error: string }
  | { status: 'ok'; url: string };
