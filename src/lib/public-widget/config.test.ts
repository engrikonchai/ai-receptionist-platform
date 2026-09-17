import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabasePublicClient } from '@/lib/supabase/public';
import { fetchWidgetPublicConfig } from './config';

vi.mock('@/lib/supabase/public', () => ({
  createSupabasePublicClient: vi.fn()
}));

function mockClientReturning(data: unknown, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error });
  const rpc = vi.fn().mockReturnValue({ maybeSingle });
  vi.mocked(createSupabasePublicClient).mockReturnValue({ rpc } as never);
  return { rpc, maybeSingle };
}

const WIDGET_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.mocked(createSupabasePublicClient).mockReset();
});

describe('fetchWidgetPublicConfig', () => {
  it('never calls the database for an origin that fails to normalize', async () => {
    const { rpc } = mockClientReturning({ title: 'x' });

    const result = await fetchWidgetPublicConfig(WIDGET_ID, 'not-a-url-*');

    expect(result).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('never calls the database when there is no Origin header at all', async () => {
    const { rpc } = mockClientReturning({ title: 'x' });

    const result = await fetchWidgetPublicConfig(WIDGET_ID, null);

    expect(result).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('calls resolve_widget_config with the widget id and the normalized origin', async () => {
    const { rpc } = mockClientReturning({ title: 'Adria Assistant' });

    await fetchWidgetPublicConfig(WIDGET_ID, 'https://Example.com');

    expect(rpc).toHaveBeenCalledWith('resolve_widget_config', {
      p_widget_id: WIDGET_ID,
      p_origin: 'https://example.com'
    });
  });

  it('returns null when the RPC returns no row', async () => {
    mockClientReturning(null);

    const result = await fetchWidgetPublicConfig(WIDGET_ID, 'https://example.com');

    expect(result).toBeNull();
  });

  it('returns null on a database error instead of throwing', async () => {
    mockClientReturning(null, { message: 'db down' });

    const result = await fetchWidgetPublicConfig(WIDGET_ID, 'https://example.com');

    expect(result).toBeNull();
  });

  it('returns null — never throws — when the public Supabase client constructor itself throws synchronously', async () => {
    // E.g. a malformed NEXT_PUBLIC_SUPABASE_URL: createClient() throws
    // synchronously rather than returning `{ error }` for an invalid
    // URL. Left uncaught, this would escape fetchWidgetPublicConfig()
    // as an unhandled exception instead of the documented "null" result.
    vi.mocked(createSupabasePublicClient).mockImplementation(() => {
      throw new TypeError('Invalid URL');
    });

    const result = await fetchWidgetPublicConfig(WIDGET_ID, 'https://example.com');

    expect(result).toBeNull();
  });

  it('returns null — never throws — when the RPC call itself rejects instead of resolving with { error }', async () => {
    const maybeSingle = vi.fn().mockRejectedValue(new Error('fetch failed'));
    const rpc = vi.fn().mockReturnValue({ maybeSingle });
    vi.mocked(createSupabasePublicClient).mockReturnValue({ rpc } as never);

    const result = await fetchWidgetPublicConfig(WIDGET_ID, 'https://example.com');

    expect(result).toBeNull();
  });

  it('reproduces the exact production widget id/origin: resolves the real config row for the confirmed database state', async () => {
    const row = {
      title: 'Adria Assistant',
      welcome_message_en: 'Hi!',
      welcome_message_me: null,
      welcome_message_ru: null,
      primary_color: '#1677ff',
      position: 'bottom-right',
      human_handoff_enabled: true,
      default_language: 'en',
      supported_languages: ['en']
    };
    const { rpc } = mockClientReturning(row);

    const result = await fetchWidgetPublicConfig(
      'e3f351d2-82cb-4882-b668-c68f1e008bc1',
      'https://chatbot-demo-iota-two.vercel.app'
    );

    expect(rpc).toHaveBeenCalledWith('resolve_widget_config', {
      p_widget_id: 'e3f351d2-82cb-4882-b668-c68f1e008bc1',
      p_origin: 'https://chatbot-demo-iota-two.vercel.app'
    });
    expect(result).toEqual(row);
  });

  it('returns the row when the RPC resolves one', async () => {
    const row = { title: 'Adria Assistant', primary_color: '#1677ff' };
    mockClientReturning(row);

    const result = await fetchWidgetPublicConfig(WIDGET_ID, 'https://example.com');

    expect(result).toEqual(row);
  });
});
