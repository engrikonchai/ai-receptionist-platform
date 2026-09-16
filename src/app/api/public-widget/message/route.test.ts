import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RateLimitOutcome, RateLimitRoute } from '@/lib/public-widget/rate-limit';
import type { MessageResult } from '@/lib/public-widget/runtime';
import { POST } from './route';

const postMessage = vi.fn<(params: unknown) => Promise<MessageResult>>();
const checkRateLimit =
  vi.fn<(route: RateLimitRoute, widgetId: string, request: Request) => Promise<RateLimitOutcome>>();

vi.mock('@/lib/public-widget/runtime', () => ({
  postMessage: (params: unknown) => postMessage(params)
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
  return new Request('https://platform.example/api/public-widget/message', {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
}

const validBody = {
  publicWidgetId: '11111111-1111-4111-8111-111111111111',
  visitorId: 'visitor-abcdefgh',
  conversationId: '22222222-2222-4222-8222-222222222222',
  message: 'Hello',
  sessionToken: 'opaque-token-value'
};

beforeEach(() => {
  postMessage.mockReset().mockResolvedValue({ status: 'unknown' });
  checkRateLimit.mockReset().mockResolvedValue({ status: 'allowed' });
});

describe('POST /api/public-widget/message', () => {
  it('returns a generic 404 for an unknown widget id', async () => {
    postMessage.mockResolvedValue({ status: 'unknown' });

    const response = await POST(request(validBody));

    expect(response.status).toBe(404);
  });

  it('returns a generic 401, never revealing whether the conversation exists, for any authorization failure', async () => {
    postMessage.mockResolvedValue({ status: 'unauthorized' });

    const response = await POST(request(validBody));

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('This chat session is no longer valid. Please refresh and try again.');
  });

  it('requires sessionToken in the request body — rejected before ever calling the runtime', async () => {
    const { sessionToken: _omit, ...withoutToken } = validBody;
    const response = await POST(request(withoutToken));

    expect(response.status).toBe(400);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('rejects a disallowed domain without ever calling the runtime', async () => {
    postMessage.mockResolvedValue({ status: 'origin_denied' });

    const response = await POST(request(validBody, 'https://example.com'));

    expect(response.status).toBe(403);
  });

  it('reports disabled', async () => {
    postMessage.mockResolvedValue({ status: 'disabled' });

    const response = await POST(request(validBody));

    const data = await response.json();
    expect(data).toEqual({ enabled: false });
  });

  it('returns 429 with a Retry-After header and never calls the runtime once the rate limit is hit', async () => {
    checkRateLimit.mockResolvedValue({ status: 'limited', retryAfterSeconds: 9 });

    const response = await POST(request(validBody));

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('9');
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('checks the "message" route’s own limit, not another route’s', async () => {
    await POST(request(validBody));
    expect(checkRateLimit).toHaveBeenCalledWith(
      'message',
      validBody.publicWidgetId,
      expect.anything()
    );
  });

  it('fails closed with 503 when the durable limiter cannot be reached', async () => {
    checkRateLimit.mockResolvedValue({ status: 'unavailable' });

    const response = await POST(request(validBody));

    expect(response.status).toBe(503);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('returns the assistant reply for an allowed, enabled, authorized request', async () => {
    postMessage.mockResolvedValue({
      status: 'ok',
      messages: [{ role: 'assistant', text: 'Hi!' }]
    });

    const response = await POST(request(validBody, 'https://example.com'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ messages: [{ role: 'assistant', text: 'Hi!' }] });
    expect(data).not.toHaveProperty('businessId');
    expect(data).not.toHaveProperty('business_id');
  });

  it('rejects a message over the length limit before ever calling the runtime', async () => {
    const response = await POST(request({ ...validBody, message: 'a'.repeat(2001) }));

    expect(response.status).toBe(400);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('never sends a business id to the runtime — only the widget-resolved fields plus the session token', async () => {
    postMessage.mockResolvedValue({ status: 'ok', messages: [] });

    await POST(request(validBody, 'https://example.com'));

    expect(postMessage).toHaveBeenCalledWith({
      publicWidgetId: validBody.publicWidgetId,
      visitorId: validBody.visitorId,
      conversationId: validBody.conversationId,
      message: validBody.message,
      sessionToken: validBody.sessionToken,
      originHeader: 'https://example.com'
    });
  });
});
