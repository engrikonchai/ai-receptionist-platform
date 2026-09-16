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
  fetchWidgetPublicConfig.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/public-widget/session', () => {
  it('rejects a malformed body before ever looking up the widget — no auth/session required either way', async () => {
    const response = await POST(request({ nope: true }));
    expect(response.status).toBe(400);
    expect(fetchWidgetPublicConfig).not.toHaveBeenCalled();
  });

  it('returns a generic 404 for a widget id that does not exist — the "cross-business" case for a public endpoint', async () => {
    fetchWidgetPublicConfig.mockResolvedValue(null);

    const response = await POST(request(validBody));

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('Widget not found.');
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('rejects a request from a domain that is not on the allow-list', async () => {
    fetchWidgetPublicConfig.mockResolvedValue(config({ allowed_origins: ['other-domain.com'] }));

    const response = await POST(request(validBody, 'https://example.com'));

    expect(response.status).toBe(403);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('rejects every domain when the widget has no allowed origins configured yet — never "allow all" by default', async () => {
    fetchWidgetPublicConfig.mockResolvedValue(config({ allowed_origins: [] }));

    const response = await POST(request(validBody, 'https://example.com'));

    expect(response.status).toBe(403);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('reports the widget as disabled without ever reaching the upstream runtime', async () => {
    fetchWidgetPublicConfig.mockResolvedValue(config({ widget_enabled: false }));

    const response = await POST(request(validBody));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ enabled: false });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('reports disabled when the business itself is inactive, even if the widget row says enabled', async () => {
    fetchWidgetPublicConfig.mockResolvedValue(
      config({ business_active: false, widget_enabled: true })
    );

    const response = await POST(request(validBody));

    const data = await response.json();
    expect(data).toEqual({ enabled: false });
  });

  it('proxies to the real chat runtime and relays its response for an allowed, enabled widget', async () => {
    fetchWidgetPublicConfig.mockResolvedValue(config());
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ enabled: true, conversationId: 'conv-1', messages: [] }), {
        status: 200
      })
    );

    const response = await POST(request(validBody, 'https://example.com'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
    const data = await response.json();
    expect(data.conversationId).toBe('conv-1');

    expect(fetch).toHaveBeenCalledWith(
      'https://chatbotdemo.example/api/widget/session',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('returns a friendly 502 instead of crashing when the upstream runtime is unreachable', async () => {
    fetchWidgetPublicConfig.mockResolvedValue(config());
    vi.mocked(fetch).mockRejectedValue(new Error('network down'));

    const response = await POST(request(validBody, 'https://example.com'));

    expect(response.status).toBe(502);
  });
});
