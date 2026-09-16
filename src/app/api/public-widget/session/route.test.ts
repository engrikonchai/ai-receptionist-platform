import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RateLimitOutcome, RateLimitRoute } from '@/lib/public-widget/rate-limit';
import type { SessionResult } from '@/lib/public-widget/runtime';
import { POST } from './route';

const startOrContinueSession = vi.fn<(params: unknown) => Promise<SessionResult>>();
const checkRateLimit =
  vi.fn<(route: RateLimitRoute, widgetId: string, request: Request) => Promise<RateLimitOutcome>>();

vi.mock('@/lib/public-widget/runtime', () => ({
  startOrContinueSession: (params: unknown) => startOrContinueSession(params)
}));

vi.mock('@/lib/public-widget/rate-limit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/public-widget/rate-limit')>(
    '@/lib/public-widget/rate-limit'
  );
  return {
    ...actual,
    checkRateLimit: (...args: Parameters<typeof actual.checkRateLimit>) => checkRateLimit(...args)
  };
});

function request(body: unknown, origin: string | null = 'https://example.com'): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (origin) headers.origin = origin;
  return new Request('https://platform.example/api/public-widget/session', {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
}

const validBody = {
  publicWidgetId: '11111111-1111-4111-8111-111111111111',
  visitorId: 'visitor-abcdefgh'
};

beforeEach(() => {
  startOrContinueSession.mockReset().mockResolvedValue({ status: 'unknown' });
  checkRateLimit.mockReset().mockResolvedValue({ status: 'allowed' });
});

describe('POST /api/public-widget/session', () => {
  it('rejects a malformed body before ever calling the runtime — no auth/session required either way', async () => {
    const response = await POST(request({ nope: true }));
    expect(response.status).toBe(400);
    expect(startOrContinueSession).not.toHaveBeenCalled();
  });

  it('rejects a body over the raw size limit before ever parsing it', async () => {
    const response = await POST(request({ ...validBody, visitorId: 'x'.repeat(20_000) }));
    expect(response.status).toBe(400);
    expect(startOrContinueSession).not.toHaveBeenCalled();
  });

  it('returns 429 with a Retry-After header and never calls the runtime once the rate limit is hit', async () => {
    checkRateLimit.mockResolvedValue({ status: 'limited', retryAfterSeconds: 17 });

    const response = await POST(request(validBody));

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('17');
    expect(startOrContinueSession).not.toHaveBeenCalled();
  });

  it('checks the "session" route’s own limit, not another route’s', async () => {
    await POST(request(validBody));
    expect(checkRateLimit).toHaveBeenCalledWith(
      'session',
      validBody.publicWidgetId,
      expect.anything()
    );
  });

  it('fails closed with 503 when the durable limiter cannot be reached', async () => {
    checkRateLimit.mockResolvedValue({ status: 'unavailable' });

    const response = await POST(request(validBody));

    expect(response.status).toBe(503);
    expect(startOrContinueSession).not.toHaveBeenCalled();
  });

  it('returns a generic 404 for a widget id that does not exist — the "cross-business" case for a public endpoint', async () => {
    startOrContinueSession.mockResolvedValue({ status: 'unknown' });

    const response = await POST(request(validBody));

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('Widget not found.');
  });

  it('rejects a request from a domain that is not on the allow-list', async () => {
    startOrContinueSession.mockResolvedValue({ status: 'origin_denied' });

    const response = await POST(request(validBody, 'https://example.com'));

    expect(response.status).toBe(403);
  });

  it('reports the widget as disabled', async () => {
    startOrContinueSession.mockResolvedValue({ status: 'disabled' });

    const response = await POST(request(validBody));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ enabled: false });
  });

  it('returns a friendly 503 when the runtime is unavailable (e.g. service-role key not configured)', async () => {
    startOrContinueSession.mockResolvedValue({ status: 'unavailable' });

    const response = await POST(request(validBody, 'https://example.com'));

    expect(response.status).toBe(503);
  });

  it('returns the conversation id, session token, and messages for an allowed, enabled widget', async () => {
    startOrContinueSession.mockResolvedValue({
      status: 'ok',
      conversationId: 'conv-1',
      sessionToken: 'opaque-token-value',
      messages: [{ role: 'assistant', text: 'Hi!' }]
    });

    const response = await POST(request(validBody, 'https://example.com'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
    const data = await response.json();
    expect(data).toEqual({
      enabled: true,
      conversationId: 'conv-1',
      sessionToken: 'opaque-token-value',
      messages: [{ role: 'assistant', text: 'Hi!' }]
    });
    expect(data).not.toHaveProperty('businessId');
  });

  it('never sends a business id to the runtime — only publicWidgetId, visitorId, language, conversationId, sessionToken, and origin', async () => {
    startOrContinueSession.mockResolvedValue({
      status: 'ok',
      conversationId: 'conv-1',
      sessionToken: 'token',
      messages: []
    });

    await POST(request(validBody, 'https://example.com'));

    expect(startOrContinueSession).toHaveBeenCalledWith({
      publicWidgetId: validBody.publicWidgetId,
      visitorId: validBody.visitorId,
      language: undefined,
      conversationId: undefined,
      sessionToken: undefined,
      originHeader: 'https://example.com'
    });
  });
});
