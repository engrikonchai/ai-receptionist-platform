import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Paddle } from '@paddle/paddle-node-sdk';
import {
  getPaddleClient,
  getPaddleEnvironment,
  getPaddlePriceId,
  getPaddleWebhookSecret,
  isPaddleConfigured
} from './client';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.PADDLE_API_KEY;
  delete process.env.PADDLE_ENVIRONMENT;
  delete process.env.PADDLE_PRICE_ID;
  delete process.env.PADDLE_WEBHOOK_SECRET;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('getPaddleEnvironment', () => {
  it('returns null when unset — never silently defaults to production', () => {
    expect(getPaddleEnvironment()).toBeNull();
  });

  it('returns null for any value other than exactly "sandbox" or "production"', () => {
    for (const bad of ['Sandbox', 'PRODUCTION', 'prod', 'sand box', '', 'live']) {
      process.env.PADDLE_ENVIRONMENT = bad;
      expect(getPaddleEnvironment()).toBeNull();
    }
  });

  it('returns "sandbox" when set to exactly that', () => {
    process.env.PADDLE_ENVIRONMENT = 'sandbox';
    expect(getPaddleEnvironment()).toBe('sandbox');
  });

  it('returns "production" when set to exactly that — validation only; callers decide policy', () => {
    process.env.PADDLE_ENVIRONMENT = 'production';
    expect(getPaddleEnvironment()).toBe('production');
  });

  it('trims surrounding whitespace', () => {
    process.env.PADDLE_ENVIRONMENT = '  sandbox  ';
    expect(getPaddleEnvironment()).toBe('sandbox');
  });
});

describe('isPaddleConfigured', () => {
  it('is false when neither variable is set', () => {
    expect(isPaddleConfigured()).toBe(false);
  });

  it('is false when the API key is set but the environment is invalid', () => {
    process.env.PADDLE_API_KEY = 'pdl_sdk_key_sandbox_dummy';
    process.env.PADDLE_ENVIRONMENT = 'production-ish';
    expect(isPaddleConfigured()).toBe(false);
  });

  it('is false when the environment is valid but the API key is missing', () => {
    process.env.PADDLE_ENVIRONMENT = 'sandbox';
    expect(isPaddleConfigured()).toBe(false);
  });

  it('is true when both are validly set', () => {
    process.env.PADDLE_API_KEY = 'pdl_sdk_key_sandbox_dummy';
    process.env.PADDLE_ENVIRONMENT = 'sandbox';
    expect(isPaddleConfigured()).toBe(true);
  });
});

describe('getPaddleClient', () => {
  it('returns null without throwing when Paddle is not configured', () => {
    expect(getPaddleClient()).toBeNull();
  });

  it('returns null when the environment variable is invalid, even with an API key present', () => {
    process.env.PADDLE_API_KEY = 'pdl_sdk_key_sandbox_dummy';
    process.env.PADDLE_ENVIRONMENT = 'not-a-real-environment';
    expect(getPaddleClient()).toBeNull();
  });

  it('returns a real Paddle client instance when validly configured', () => {
    process.env.PADDLE_API_KEY = 'pdl_sdk_key_sandbox_dummy';
    process.env.PADDLE_ENVIRONMENT = 'sandbox';
    expect(getPaddleClient()).toBeInstanceOf(Paddle);
  });

  it('never caches across a key rotation — a later call reflects the new value', () => {
    process.env.PADDLE_API_KEY = 'pdl_sdk_key_sandbox_dummy_1';
    process.env.PADDLE_ENVIRONMENT = 'sandbox';
    const first = getPaddleClient();

    process.env.PADDLE_API_KEY = 'pdl_sdk_key_sandbox_dummy_2';
    const second = getPaddleClient();

    expect(first).not.toBe(second);
  });
});

describe('getPaddlePriceId / getPaddleWebhookSecret', () => {
  it('return null when unset', () => {
    expect(getPaddlePriceId()).toBeNull();
    expect(getPaddleWebhookSecret()).toBeNull();
  });

  it('return the trimmed configured value', () => {
    process.env.PADDLE_PRICE_ID = '  pri_dummy_sandbox_price  ';
    process.env.PADDLE_WEBHOOK_SECRET = '  ntfset_dummy_sandbox_secret  ';
    expect(getPaddlePriceId()).toBe('pri_dummy_sandbox_price');
    expect(getPaddleWebhookSecret()).toBe('ntfset_dummy_sandbox_secret');
  });

  it('treat an empty/whitespace-only value as unset', () => {
    process.env.PADDLE_PRICE_ID = '   ';
    expect(getPaddlePriceId()).toBeNull();
  });
});

describe('module import safety', () => {
  it('resolves without throwing even when no Paddle env vars are set — production build must still complete', async () => {
    await expect(import('./client')).resolves.toBeTruthy();
  });
});
