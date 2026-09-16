import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WidgetPublicConfigRow } from '@/lib/supabase/database.types';
import { POST } from './route';

const fetchWidgetPublicConfig = vi.fn<(id: string) => Promise<WidgetPublicConfigRow | null>>();

vi.mock('@/lib/public-widget/config', () => ({
  fetchWidgetPublicConfig: (id: string) => fetchWidgetPublicConfig(id)
}));

vi.mock('@/lib/public-widget/env', () => ({
  getChatRuntimeOrigin: () => 'https://chatbotdemo.example',
  isChatRuntimeConfigured: () => true,
  CHAT_RUNTIME_MISSING_MESSAGE:
    "The chat assistant isn't available right now. Please try again shortly."
}));

function config(overrides: Partial<WidgetPublicConfigRow> = {}): WidgetPublicConfigRow {
  return {
    public_widget_id: 'widget-1',
    business_active: true,
    supported_languages: ['en'],
    default_language: 'en',
    title: 'Adria Assistant',
    welcome_message_en: 'Hi!',
    welcome_message_me: null,
    welcome_message_ru: null,
    primary_color: '#1677ff',
    position: 'bottom-right',
    widget_enabled: true,
    human_handoff_enabled: true,
    allowed_origins: ['example.com'],
    ...overrides
  };
}

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
  fetchWidgetPublicConfig.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/public-widget/message', () => {
  it('returns a generic 404 for an unknown widget id', async () => {
    fetchWidgetPublicConfig.mockResolvedValue(null);

    const response = await POST(request(validBody));

    expect(response.status).toBe(404);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('rejects a disallowed domain without ever reaching the upstream runtime', async () => {
    fetchWidgetPublicConfig.mockResolvedValue(config({ allowed_origins: ['other-domain.com'] }));

    const response = await POST(request(validBody, 'https://example.com'));

    expect(response.status).toBe(403);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('reports disabled without reaching the upstream runtime', async () => {
    fetchWidgetPublicConfig.mockResolvedValue(config({ widget_enabled: false }));

    const response = await POST(request(validBody));

    const data = await response.json();
    expect(data).toEqual({ enabled: false });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('proxies an allowed, enabled request to the real chat runtime', async () => {
    fetchWidgetPublicConfig.mockResolvedValue(config());
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ role: 'assistant', text: 'Hi!' }] }), {
        status: 200
      })
    );

    const response = await POST(request(validBody, 'https://example.com'));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      'https://chatbotdemo.example/api/widget/message',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('rejects a message over the length limit before ever looking up the widget', async () => {
    const response = await POST(request({ ...validBody, message: 'a'.repeat(2001) }));

    expect(response.status).toBe(400);
    expect(fetchWidgetPublicConfig).not.toHaveBeenCalled();
  });
});
