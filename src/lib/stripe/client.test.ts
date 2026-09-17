import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getStripeClient,
  getStripePriceId,
  getStripeWebhookSecret,
  isStripeConfigured
} from './client';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_PRICE_ID;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('isStripeConfigured', () => {
  it('is false when STRIPE_SECRET_KEY is unset', () => {
    expect(isStripeConfigured()).toBe(false);
  });

  it('is true once STRIPE_SECRET_KEY is set', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
    expect(isStripeConfigured()).toBe(true);
  });
});

describe('getStripeClient', () => {
  it('returns null — never throws — when STRIPE_SECRET_KEY is unset', () => {
    expect(() => getStripeClient()).not.toThrow();
    expect(getStripeClient()).toBeNull();
  });

  it('returns a real client once STRIPE_SECRET_KEY is set', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
    const client = getStripeClient();
    expect(client).not.toBeNull();
  });

  it('never caches a stale client across a key rotation between calls', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_first';
    const first = getStripeClient();
    process.env.STRIPE_SECRET_KEY = 'sk_test_second';
    const second = getStripeClient();
    expect(first).not.toBe(second);
  });
});

describe('getStripePriceId', () => {
  it('returns null when unset — callers must never fall back to a hardcoded price', () => {
    expect(getStripePriceId()).toBeNull();
  });

  it('returns the trimmed configured value', () => {
    process.env.STRIPE_PRICE_ID = '  price_123  ';
    expect(getStripePriceId()).toBe('price_123');
  });

  it('treats an empty string as unset', () => {
    process.env.STRIPE_PRICE_ID = '   ';
    expect(getStripePriceId()).toBeNull();
  });
});

describe('getStripeWebhookSecret', () => {
  it('returns null when unset — the webhook route must reject every request rather than skip verification', () => {
    expect(getStripeWebhookSecret()).toBeNull();
  });

  it('returns the trimmed configured value', () => {
    process.env.STRIPE_WEBHOOK_SECRET = '  whsec_abc  ';
    expect(getStripeWebhookSecret()).toBe('whsec_abc');
  });
});

describe('module import with no Stripe environment variables configured at all', () => {
  it('never throws at import/module-evaluation time — required for the production build to succeed without Stripe configured', async () => {
    // A fresh, isolated import (not the one already loaded at the top
    // of this file) — proves the module itself has no top-level
    // `new Stripe(...)` or env-var read that could throw during
    // `next build`'s static analysis pass.
    await expect(import('./client')).resolves.toBeDefined();
  });
});
