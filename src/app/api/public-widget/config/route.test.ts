import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WidgetPublicConfigRow } from '@/lib/supabase/database.types';
import { GET } from './route';

const fetchWidgetPublicConfig = vi.fn<(id: string) => Promise<WidgetPublicConfigRow | null>>();

vi.mock('@/lib/public-widget/config', () => ({
  fetchWidgetPublicConfig: (id: string) => fetchWidgetPublicConfig(id)
}));

function config(overrides: Partial<WidgetPublicConfigRow> = {}): WidgetPublicConfigRow {
  return {
    public_widget_id: 'widget-1',
    business_active: true,
    supported_languages: ['en', 'me'],
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

function request(widgetId: string | null, origin: string | null = 'https://example.com'): Request {
  const url = new URL('https://platform.example/api/public-widget/config');
  if (widgetId) url.searchParams.set('widgetId', widgetId);
  const headers: Record<string, string> = {};
  if (origin) headers.origin = origin;
  return new Request(url, { headers });
}

beforeEach(() => {
  fetchWidgetPublicConfig.mockReset();
});

describe('GET /api/public-widget/config', () => {
  it('rejects a request with no widgetId query param', async () => {
    const response = await GET(request(null));
    expect(response.status).toBe(400);
    expect(fetchWidgetPublicConfig).not.toHaveBeenCalled();
  });

  it('returns a generic 404 for an unknown widget id', async () => {
    fetchWidgetPublicConfig.mockResolvedValue(null);
    const response = await GET(request('unknown'));
    expect(response.status).toBe(404);
  });

  it('rejects a domain that is not allow-listed', async () => {
    fetchWidgetPublicConfig.mockResolvedValue(config({ allowed_origins: ['other-domain.com'] }));
    const response = await GET(request('widget-1', 'https://example.com'));
    expect(response.status).toBe(403);
  });

  it('never returns anything for an empty allow-list — never "allow all" by default', async () => {
    fetchWidgetPublicConfig.mockResolvedValue(config({ allowed_origins: [] }));
    const response = await GET(request('widget-1', 'https://example.com'));
    expect(response.status).toBe(403);
  });

  it('returns only the safe display fields for an allowed origin, never internal ids', async () => {
    fetchWidgetPublicConfig.mockResolvedValue(config());
    const response = await GET(request('widget-1', 'https://example.com'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({
      enabled: true,
      title: 'Adria Assistant',
      primaryColor: '#1677ff',
      position: 'bottom-right',
      humanHandoffEnabled: true,
      defaultLanguage: 'en',
      supportedLanguages: ['en', 'me']
    });
    expect(data.public_widget_id).toBeUndefined();
    expect(data.business_id).toBeUndefined();
  });

  it('reports enabled:false when the widget is disabled, still without leaking anything else', async () => {
    fetchWidgetPublicConfig.mockResolvedValue(config({ widget_enabled: false }));
    const response = await GET(request('widget-1', 'https://example.com'));

    const data = await response.json();
    expect(data.enabled).toBe(false);
  });
});
