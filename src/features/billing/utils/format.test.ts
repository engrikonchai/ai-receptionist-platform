import { describe, expect, it } from 'vitest';
import { formatDate, formatMoney, SUBSCRIPTION_STATUS_LABEL } from './format';

describe('formatMoney', () => {
  it('formats cents as a currency string using the currency Stripe returned', () => {
    expect(formatMoney(2900, 'usd')).toBe('$29.00');
  });

  it('uppercases a lowercase Stripe currency code', () => {
    expect(formatMoney(1000, 'eur')).toContain('10.00');
  });
});

describe('formatDate', () => {
  it('formats an ISO timestamp as a short date', () => {
    expect(formatDate('2026-02-01T00:00:00.000Z')).toMatch(/01 Feb 2026/);
  });

  it('returns an empty string for an invalid date rather than "Invalid Date"', () => {
    expect(formatDate('not-a-date')).toBe('');
  });
});

describe('SUBSCRIPTION_STATUS_LABEL', () => {
  it('has a label for every normalized Stripe subscription status', () => {
    const statuses = [
      'incomplete',
      'incomplete_expired',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'paused'
    ] as const;

    for (const status of statuses) {
      expect(SUBSCRIPTION_STATUS_LABEL[status]).toBeTruthy();
    }
  });
});
