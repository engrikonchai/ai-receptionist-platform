import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RateLimitOutcome, RateLimitRoute } from '@/lib/public-widget/rate-limit';
import type { HandoffRequestResult } from '@/lib/public-widget/runtime';
import { POST } from './route';

const submitHandoffRequest = vi.fn<(params: unknown) => Promise<HandoffRequestResult>>();
const checkRateLimit =
  vi.fn<(route: RateLimitRoute, widgetId: string, request: Request) => Promise<RateLimitOutcome>>();

vi.mock('@/lib/public-widget/runtime', () => ({
  submitHandoffRequest: (params: unknown) => submitHandoffRequest(params)
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
  return new Request('https://platform.example/api/public-widget/handoff', {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
}

const validBody = {
  publicWidgetId: '11111111-1111-4111-8111-111111111111',
  visitorId: 'visitor-abcdefgh',
  conversationId: '22222222-2222-4222-8222-222222222222',
  sessionToken: 'opaque-token-value',
  clientRequestId: 'client-request-id-1',
  name: 'Jane Visitor',
  email: 'jane@example.com',
  consent: true
};

beforeEach(() => {
  submitHandoffRequest.mockReset().mockResolvedValue({ status: 'unknown' });
  checkRateLimit.mockReset().mockResolvedValue({ status: 'allowed' });
});

describe('POST /api/public-widget/handoff', () => {
  it('returns a generic 404 for an unknown widget id', async () => {
    submitHandoffRequest.mockResolvedValue({ status: 'unknown' });

    const response = await POST(request(validBody));

    expect(response.status).toBe(404);
  });

  it('returns a generic 401, never revealing whether the conversation exists, for any authorization failure', async () => {
    submitHandoffRequest.mockResolvedValue({ status: 'unauthorized' });

    const response = await POST(request(validBody));

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('This chat session is no longer valid. Please refresh and try again.');
  });

  it('rejects a disallowed origin without ever calling the runtime', async () => {
    submitHandoffRequest.mockResolvedValue({ status: 'origin_denied' });

    const response = await POST(request(validBody, 'https://example.com'));

    expect(response.status).toBe(403);
  });

  it('reports disabled with a clear message when human handoff is off for this widget', async () => {
    submitHandoffRequest.mockResolvedValue({ status: 'disabled' });

    const response = await POST(request(validBody));

    const data = await response.json();
    expect(data.enabled).toBe(false);
  });

  it('requires name — rejected before ever calling the runtime', async () => {
    const { name: _omit, ...withoutName } = validBody;
    const response = await POST(request(withoutName));

    expect(response.status).toBe(400);
    expect(submitHandoffRequest).not.toHaveBeenCalled();
  });

  it('rejects when neither email nor phone is supplied', async () => {
    const { email: _omit, ...withoutEmail } = validBody;
    const response = await POST(request(withoutEmail));

    expect(response.status).toBe(400);
    expect(submitHandoffRequest).not.toHaveBeenCalled();
  });

  it('rejects an implausible email address', async () => {
    const response = await POST(request({ ...validBody, email: 'not-an-email' }));

    expect(response.status).toBe(400);
    expect(submitHandoffRequest).not.toHaveBeenCalled();
  });

  it('rejects an implausible phone number', async () => {
    const { email: _omit, ...withoutEmail } = validBody;
    const response = await POST(request({ ...withoutEmail, phone: 'abc' }));

    expect(response.status).toBe(400);
    expect(submitHandoffRequest).not.toHaveBeenCalled();
  });

  it('requires consent — rejected before ever calling the runtime', async () => {
    const { consent: _omit, ...withoutConsent } = validBody;
    const response = await POST(request(withoutConsent));

    expect(response.status).toBe(400);
    expect(submitHandoffRequest).not.toHaveBeenCalled();
  });

  it('requires clientRequestId — rejected before ever calling the runtime', async () => {
    const { clientRequestId: _omit, ...withoutClientRequestId } = validBody;
    const response = await POST(request(withoutClientRequestId));

    expect(response.status).toBe(400);
    expect(submitHandoffRequest).not.toHaveBeenCalled();
  });

  it('rejects an invalid widget id shape before ever calling the runtime', async () => {
    const response = await POST(request({ ...validBody, publicWidgetId: 'not-a-uuid' }));

    expect(response.status).toBe(400);
    expect(submitHandoffRequest).not.toHaveBeenCalled();
  });

  it('checks the "handoff" route’s own limit, not another route’s', async () => {
    await POST(request(validBody));
    expect(checkRateLimit).toHaveBeenCalledWith(
      'handoff',
      validBody.publicWidgetId,
      expect.anything()
    );
  });

  it('returns 429 with a Retry-After header and never calls the runtime once the rate limit is hit', async () => {
    checkRateLimit.mockResolvedValue({ status: 'limited', retryAfterSeconds: 12 });

    const response = await POST(request(validBody));

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('12');
    expect(submitHandoffRequest).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when the durable limiter cannot be reached', async () => {
    checkRateLimit.mockResolvedValue({ status: 'unavailable' });

    const response = await POST(request(validBody));

    expect(response.status).toBe(503);
    expect(submitHandoffRequest).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when the runtime reports it is unavailable', async () => {
    submitHandoffRequest.mockResolvedValue({ status: 'unavailable' });

    const response = await POST(request(validBody));

    expect(response.status).toBe(503);
  });

  it('returns success for an allowed, enabled, authorized submission — and a replayed one', async () => {
    submitHandoffRequest.mockResolvedValue({ status: 'ok' });

    const response = await POST(request(validBody, 'https://example.com'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ success: true });
    expect(data).not.toHaveProperty('businessId');
    expect(data).not.toHaveProperty('business_id');
  });

  it('never sends a business id to the runtime — only the widget-resolved fields, session token, and contact form data', async () => {
    submitHandoffRequest.mockResolvedValue({ status: 'ok' });

    await POST(request(validBody, 'https://example.com'));

    expect(submitHandoffRequest).toHaveBeenCalledWith({
      publicWidgetId: validBody.publicWidgetId,
      visitorId: validBody.visitorId,
      conversationId: validBody.conversationId,
      sessionToken: validBody.sessionToken,
      clientRequestId: validBody.clientRequestId,
      name: validBody.name,
      email: validBody.email,
      phone: undefined,
      message: undefined,
      originHeader: 'https://example.com'
    });
  });

  it('rejects a name over the length limit before ever calling the runtime', async () => {
    const response = await POST(request({ ...validBody, name: 'a'.repeat(201) }));

    expect(response.status).toBe(400);
    expect(submitHandoffRequest).not.toHaveBeenCalled();
  });

  it('rejects a message over the length limit before ever calling the runtime', async () => {
    const response = await POST(request({ ...validBody, message: 'a'.repeat(1001) }));

    expect(response.status).toBe(400);
    expect(submitHandoffRequest).not.toHaveBeenCalled();
  });
});
