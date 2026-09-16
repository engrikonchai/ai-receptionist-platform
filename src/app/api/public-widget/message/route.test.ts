import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageResult } from '@/lib/public-widget/runtime';
import { POST } from './route';

const postMessage = vi.fn<(params: unknown) => Promise<MessageResult>>();
const checkRateLimit = vi.fn<(key: string, limit: number, windowMs: number) => boolean>();

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
  message: 'Hello'
};

beforeEach(() => {
  postMessage.mockReset();
  checkRateLimit.mockReset().mockReturnValue(true);
});

describe('POST /api/public-widget/message', () => {
  it('returns a generic 404 for an unknown widget id', async () => {
    postMessage.mockResolvedValue({ status: 'unknown' });

    const response = await POST(request(validBody));

    expect(response.status).toBe(404);
  });

  it('returns a generic 404 when the conversation id does not belong to the resolved business', async () => {
    postMessage.mockResolvedValue({ status: 'conversation_not_found' });

    const response = await POST(request(validBody));

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('Conversation not found.');
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

  it('returns 429 and never calls the runtime once the rate limit is hit', async () => {
    checkRateLimit.mockReturnValue(false);

    const response = await POST(request(validBody));

    expect(response.status).toBe(429);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('returns the assistant reply for an allowed, enabled request', async () => {
    postMessage.mockResolvedValue({
      status: 'ok',
      messages: [{ role: 'assistant', text: 'Hi!' }]
    });

    const response = await POST(request(validBody, 'https://example.com'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ messages: [{ role: 'assistant', text: 'Hi!' }] });
  });

  it('rejects a message over the length limit before ever calling the runtime', async () => {
    const response = await POST(request({ ...validBody, message: 'a'.repeat(2001) }));

    expect(response.status).toBe(400);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('never sends a business id to the runtime — only the widget-resolved fields', async () => {
    postMessage.mockResolvedValue({ status: 'ok', messages: [] });

    await POST(request(validBody, 'https://example.com'));

    expect(postMessage).toHaveBeenCalledWith({
      publicWidgetId: validBody.publicWidgetId,
      visitorId: validBody.visitorId,
      conversationId: validBody.conversationId,
      message: validBody.message,
      originHeader: 'https://example.com'
    });
  });
});
