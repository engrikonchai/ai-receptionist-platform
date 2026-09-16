import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkRateLimit, clientIpFrom } from './rate-limit';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('checkRateLimit', () => {
  it('allows requests up to the limit within a window', () => {
    const key = `key-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, 5, 60_000)).toBe(true);
    }
  });

  it('rejects the request once the limit is exceeded within a window', () => {
    const key = `key-${Math.random()}`;
    for (let i = 0; i < 5; i++) checkRateLimit(key, 5, 60_000);
    expect(checkRateLimit(key, 5, 60_000)).toBe(false);
  });

  it('resets the count once the window has elapsed', () => {
    const key = `key-${Math.random()}`;
    for (let i = 0; i < 5; i++) checkRateLimit(key, 5, 60_000);
    expect(checkRateLimit(key, 5, 60_000)).toBe(false);

    vi.setSystemTime(60_001);
    expect(checkRateLimit(key, 5, 60_000)).toBe(true);
  });

  it('tracks separate keys independently — one widget/IP hitting its limit never blocks another', () => {
    const keyA = `key-a-${Math.random()}`;
    const keyB = `key-b-${Math.random()}`;
    for (let i = 0; i < 5; i++) checkRateLimit(keyA, 5, 60_000);

    expect(checkRateLimit(keyA, 5, 60_000)).toBe(false);
    expect(checkRateLimit(keyB, 5, 60_000)).toBe(true);
  });
});

describe('clientIpFrom', () => {
  it('reads the first address from x-forwarded-for', () => {
    const request = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' }
    });
    expect(clientIpFrom(request)).toBe('203.0.113.1');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const request = new Request('https://example.com', {
      headers: { 'x-real-ip': '203.0.113.2' }
    });
    expect(clientIpFrom(request)).toBe('203.0.113.2');
  });

  it('falls back to "unknown" when neither header is present', () => {
    const request = new Request('https://example.com');
    expect(clientIpFrom(request)).toBe('unknown');
  });
});
