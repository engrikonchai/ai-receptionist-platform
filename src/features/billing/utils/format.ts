import type { BusinessSubscriptionStatus } from '../api/types';

export const SUBSCRIPTION_STATUS_LABEL: Record<BusinessSubscriptionStatus, string> = {
  trialing: 'Trial',
  active: 'Active',
  past_due: 'Payment past due',
  paused: 'Paused',
  canceled: 'Canceled'
};

/** `currency` is Paddle's own lowercase ISO code (e.g. "usd") — Intl wants uppercase. */
export function formatMoney(unitAmount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase()
  }).format(unitAmount / 100);
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
