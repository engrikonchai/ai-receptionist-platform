import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RateLimitOutcome, RateLimitRoute } from '@/lib/public-widget/rate-limit';
import type { WidgetPublicConfigRpcResult } from '@/lib/supabase/database.types';
import { GET } from './route';

const fetchWidgetPublicConfig =
  vi.fn<(id: string, origin: string | null) => Promise<WidgetPublicConfigRpcResult | null>>();
const checkRateLimit =
  vi.fn<(route: RateLimitRoute, widgetId: string, request: Request) => Promise<RateLimitOutcome>>();

vi.mock('@/lib/public-widget/config', () => ({
  fetchWidgetPublicConfig: (id: string, origin: string | null) =>
    fetchWidgetPublicConfig(id, origin)
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

function config(overrides: Partial<WidgetPublicConfigRpcResult> = {}): WidgetPublicConfigRpcResult {
  return {
    title: 'Adria Assistant',
    welcome_message_en: 'Hi!',
    welcome_message_me: null,
    welcome_message_ru: null,
    primary_color: '#1677ff',
    position: 'bottom-right',
    human_handoff_enabled: true,
    default_language: 'en',
    supported_languages: ['en'],
    ...overrides
  };
}

function request(widgetId: string | null, origin: string | null = 'https://example.com'): Request {
  const url = new URL('https://platform.example/api/public-widget/config');
  if (widgetId !== null) url.searchParams.set('widgetId', widgetId);
  const headers: Record<string, string> = {};
  if (origin) headers.origin = origin;
  return new Request(url, { headers });
}

const WIDGET_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  fetchWidgetPublicConfig.mockReset();
  checkRateLimit.mockReset().mockResolvedValue({ status: 'allowed' });
});

describe('GET /api/public-widget/config', () => {
  it('returns 400 for a missing widgetId', async () => {
    const response = await GET(request(null));
    expect(response.status).toBe(400);
    expect(fetchWidgetPublicConfig).not.toHaveBeenCalled();
  });

  it('checks the "config" route’s own rate limit', async () => {
    await GET(request(WIDGET_ID));
    expect(checkRateLimit).toHaveBeenCalledWith('config', WIDGET_ID, expect.anything());
  });

  it('returns 429 with a Retry-After header once the rate limit is hit', async () => {
    checkRateLimit.mockResolvedValue({ status: 'limited', retryAfterSeconds: 5 });

    const response = await GET(request(WIDGET_ID));

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('5');
    expect(fetchWidgetPublicConfig).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when the durable limiter cannot be reached', async () => {
    checkRateLimit.mockResolvedValue({ status: 'unavailable' });

    const response = await GET(request(WIDGET_ID));

    expect(response.status).toBe(503);
    expect(fetchWidgetPublicConfig).not.toHaveBeenCalled();
  });

  it('returns enabled: false, indistinguishable from every other failure reason, for an unknown widget id', async () => {
    fetchWidgetPublicConfig.mockResolvedValue(null);

    const response = await GET(request(WIDGET_ID));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ enabled: false });
  });

  it('passes the request origin through to the config lookup so the RPC can enforce the allow-list itself', async () => {
    fetchWidgetPublicConfig.mockResolvedValue(null);

    await GET(request(WIDGET_ID, 'https://not-allowed.example'));

    expect(fetchWidgetPublicConfig).toHaveBeenCalledWith(WIDGET_ID, 'https://not-allowed.example');
  });

  it('returns the safe display fields for a real, active, enabled, allow-listed widget', async () => {
    fetchWidgetPublicConfig.mockResolvedValue(config());

    const response = await GET(request(WIDGET_ID, 'https://example.com'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
    const data = await response.json();
    expect(data).toEqual({
      enabled: true,
      title: 'Adria Assistant',
      primaryColor: '#1677ff',
      position: 'bottom-right',
      humanHandoffEnabled: true,
      defaultLanguage: 'en',
      supportedLanguages: ['en']
    });
  });

  it('never includes business_id, owner_id, allowed_origins, or handoff_email in the response', async () => {
    fetchWidgetPublicConfig.mockResolvedValue(config());

    const response = await GET(request(WIDGET_ID, 'https://example.com'));
    const data = await response.json();

    expect(data).not.toHaveProperty('businessId');
    expect(data).not.toHaveProperty('business_id');
    expect(data).not.toHaveProperty('ownerId');
    expect(data).not.toHaveProperty('owner_id');
    expect(data).not.toHaveProperty('allowedOrigins');
    expect(data).not.toHaveProperty('allowed_origins');
    expect(data).not.toHaveProperty('handoffEmail');
    expect(data).not.toHaveProperty('handoff_email');
  });
});
