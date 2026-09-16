import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { checkRateLimit, clientIpFrom, RATE_LIMITS } from './rate-limit';

vi.mock('@/lib/supabase/service-role', () => ({
  createSupabaseServiceRoleClient: vi.fn()
}));

const ORIGINAL_ENV = { ...process.env };

/** A fake durable store, external to the module under test — every "instance" below calls the same in-memory table here, standing in for Postgres, so counting behavior can be asserted without a live database. */
function createFakeDurableStore() {
  const rows = new Map<string, { count: number; windowStart: number }>();

  function checkAndIncrement(bucketKey: string, limit: number, windowSeconds: number) {
    const now = Date.now();
    const existing = rows.get(bucketKey);
    const windowMs = windowSeconds * 1000;

    let count: number;
    let windowStart: number;
    if (!existing || now - existing.windowStart >= windowMs) {
      count = 1;
      windowStart = now;
    } else {
      count = existing.count + 1;
      windowStart = existing.windowStart;
    }
    rows.set(bucketKey, { count, windowStart });

    const retryAfterSeconds = Math.max(0, Math.ceil((windowStart + windowMs - now) / 1000));
    return { allowed: count <= limit, retry_after_seconds: retryAfterSeconds };
  }

  return { checkAndIncrement, rows };
}

function mockServiceRoleClient(store: ReturnType<typeof createFakeDurableStore>): SupabaseClient {
  const rpc = vi.fn(
    (_fn: string, args: { p_bucket_key: string; p_limit: number; p_window_seconds: number }) => ({
      single: () =>
        Promise.resolve({
          data: store.checkAndIncrement(args.p_bucket_key, args.p_limit, args.p_window_seconds),
          error: null
        })
    })
  );
  return { rpc } as unknown as SupabaseClient;
}

beforeEach(() => {
  process.env.RATE_LIMIT_HASH_SECRET = 'test-hash-secret-do-not-use-in-production';
  vi.mocked(createSupabaseServiceRoleClient).mockReset();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('checkRateLimit', () => {
  it('returns unavailable (fails closed) when RATE_LIMIT_HASH_SECRET is not configured', async () => {
    delete process.env.RATE_LIMIT_HASH_SECRET;

    const result = await checkRateLimit('session', 'widget-a', new Request('https://example.com'));

    expect(result).toEqual({ status: 'unavailable' });
    expect(createSupabaseServiceRoleClient).not.toHaveBeenCalled();
  });

  it('returns unavailable (fails closed) when the service-role client cannot be created', async () => {
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(null);

    const result = await checkRateLimit('session', 'widget-a', new Request('https://example.com'));

    expect(result).toEqual({ status: 'unavailable' });
  });

  it('returns unavailable (fails closed) — protecting AI/runtime cost — when the durable store itself errors', async () => {
    const rpc = vi.fn(() => ({
      single: () => Promise.resolve({ data: null, error: { message: 'db down' } })
    }));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({
      rpc
    } as unknown as SupabaseClient);

    const result = await checkRateLimit('session', 'widget-a', new Request('https://example.com'));

    expect(result).toEqual({ status: 'unavailable' });
  });

  it('never sends a raw IP address to the durable store — only a hash', async () => {
    const store = createFakeDurableStore();
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockServiceRoleClient(store));

    await checkRateLimit(
      'session',
      'widget-a',
      new Request('https://example.com', { headers: { 'x-forwarded-for': '203.0.113.42' } })
    );

    const [bucketKey] = [...store.rows.keys()];
    expect(bucketKey).not.toContain('203.0.113.42');
    expect(bucketKey).toMatch(/^[0-9a-f]{64}$/); // hex-encoded SHA-256 digest
  });

  it('allows requests up to the configured limit for a route, then reports limited with a positive retry-after', async () => {
    const store = createFakeDurableStore();
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockServiceRoleClient(store));
    const request = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '203.0.113.1' }
    });

    for (let i = 0; i < RATE_LIMITS.session.limit; i++) {
      const result = await checkRateLimit('session', 'widget-a', request);
      expect(result).toEqual({ status: 'allowed' });
    }

    const limited = await checkRateLimit('session', 'widget-a', request);
    expect(limited.status).toBe('limited');
    if (limited.status === 'limited') {
      expect(limited.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it('enforces separate limits per route — hitting the session limit never blocks message or config requests for the same widget/IP', async () => {
    const store = createFakeDurableStore();
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockServiceRoleClient(store));
    const request = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '203.0.113.1' }
    });

    for (let i = 0; i < RATE_LIMITS.session.limit; i++) {
      await checkRateLimit('session', 'widget-a', request);
    }
    expect((await checkRateLimit('session', 'widget-a', request)).status).toBe('limited');

    expect((await checkRateLimit('message', 'widget-a', request)).status).toBe('allowed');
    expect((await checkRateLimit('config', 'widget-a', request)).status).toBe('allowed');
  });

  it('shares the limit atomically across simulated concurrent instances hitting the same durable store', async () => {
    // Two independent checkRateLimit() calls, each resolving its own
    // service-role client, both backed by the SAME fake durable store —
    // standing in for two separate serverless instances that share
    // nothing except the database. If counting lived in this module's
    // own memory (the old in-memory design), each "instance" would
    // start its own counter at zero and the shared limit would never be
    // enforced; because the store is external and each call reads/writes
    // it, the count reflects both instances' traffic together.
    const store = createFakeDurableStore();
    const clientForInstanceA = mockServiceRoleClient(store);
    const clientForInstanceB = mockServiceRoleClient(store);
    const request = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '203.0.113.1' }
    });

    let allowedCount = 0;
    for (let i = 0; i < RATE_LIMITS.session.limit; i++) {
      vi.mocked(createSupabaseServiceRoleClient).mockReturnValueOnce(
        i % 2 === 0 ? clientForInstanceA : clientForInstanceB
      );
      const result = await checkRateLimit('session', 'widget-a', request);
      if (result.status === 'allowed') allowedCount++;
    }
    expect(allowedCount).toBe(RATE_LIMITS.session.limit);

    vi.mocked(createSupabaseServiceRoleClient).mockReturnValueOnce(clientForInstanceA);
    const overLimit = await checkRateLimit('session', 'widget-a', request);
    expect(overLimit.status).toBe('limited');
  });

  it('tracks separate widgets independently under the same IP', async () => {
    const store = createFakeDurableStore();
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockServiceRoleClient(store));
    const request = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '203.0.113.1' }
    });

    for (let i = 0; i < RATE_LIMITS.session.limit; i++) {
      await checkRateLimit('session', 'widget-a', request);
    }
    expect((await checkRateLimit('session', 'widget-a', request)).status).toBe('limited');
    expect((await checkRateLimit('session', 'widget-b', request)).status).toBe('allowed');
  });
});

describe('clientIpFrom', () => {
  it('prefers x-vercel-forwarded-for over x-forwarded-for', () => {
    const request = new Request('https://example.com', {
      headers: { 'x-vercel-forwarded-for': '203.0.113.9', 'x-forwarded-for': '203.0.113.1' }
    });
    expect(clientIpFrom(request)).toBe('203.0.113.9');
  });

  it('falls back to the first address in x-forwarded-for', () => {
    const request = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' }
    });
    expect(clientIpFrom(request)).toBe('203.0.113.1');
  });

  it('falls back to x-real-ip when neither forwarding header is present', () => {
    const request = new Request('https://example.com', { headers: { 'x-real-ip': '203.0.113.2' } });
    expect(clientIpFrom(request)).toBe('203.0.113.2');
  });

  it('falls back to "unknown" when no header is present', () => {
    expect(clientIpFrom(new Request('https://example.com'))).toBe('unknown');
  });
});
