import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { verifyActiveBusiness } from './authorize';
import { GENERIC_LOAD_ERROR, GENERIC_SAVE_ERROR, SESSION_EXPIRED_MESSAGE } from './types';
import { fetchWidgetSettings, saveWidgetSettings } from './service';
import type { WidgetSettingsInput } from './types';

vi.mock('./authorize', () => ({
  verifyActiveBusiness: vi.fn()
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn()
}));

/** A stand-in for Supabase's PostgREST query builder — see the identical helper in inbox/knowledge's own service.test.ts. */
function chainable<T>(result: T) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (value: T) => void, reject?: (reason: unknown) => void) =>
            Promise.resolve(result).then(resolve, reject);
        }
        if (prop === 'catch') {
          return (reject: (reason: unknown) => void) => Promise.resolve(result).catch(reject);
        }
        return () => proxy;
      }
    }
  );
  return proxy;
}

const stubUser = { id: 'user-1' } as unknown as User;
const VERIFIED_BUSINESS_ID = 'biz-verified';

function mockVerifiedBusiness(from: ReturnType<typeof vi.fn>, businessId = VERIFIED_BUSINESS_ID) {
  vi.mocked(verifyActiveBusiness).mockResolvedValue({
    ok: true,
    ctx: { supabase: { from } as unknown as SupabaseClient, user: stubUser, businessId }
  });
}

const businessRow = {
  public_widget_id: 'widget-uuid-1',
  supported_languages: ['en', 'me'],
  default_language: 'en',
  handoff_email: 'owner@example.com'
};

const widgetRow = {
  title: 'Adria Assistant',
  welcome_message_en: 'Hi there!',
  welcome_message_me: null,
  welcome_message_ru: null,
  primary_color: '#1677ff',
  position: 'bottom-right',
  mock_ai_enabled: true,
  human_handoff_enabled: true,
  allowed_origins: ['example.com']
};

const validInput: WidgetSettingsInput = {
  enabled: true,
  assistantName: 'Adria Assistant',
  welcomeMessageEn: 'Hi there!',
  welcomeMessageMe: '',
  welcomeMessageRu: '',
  primaryColor: '#1677ff',
  position: 'bottom-right',
  supportedLanguages: ['en', 'me'],
  humanHandoffEnabled: true,
  handoffEmail: 'owner@example.com',
  allowedOrigins: ['example.com']
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchWidgetSettings', () => {
  it('propagates the authorization failure instead of querying anything — unauthenticated case', async () => {
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: false,
      error: SESSION_EXPIRED_MESSAGE
    });

    await expect(fetchWidgetSettings('biz-1')).rejects.toThrow(SESSION_EXPIRED_MESSAGE);
  });

  it('never queries anything for a business id that is not the caller’s own — cross-business case', async () => {
    const from = vi.fn();
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: false,
      error: "We couldn't find that business, or you don't have access to it."
    });

    await expect(fetchWidgetSettings('biz-someone-elses')).rejects.toThrow();
    expect(from).not.toHaveBeenCalled();
  });

  it('maps the business + widget_settings rows into one WidgetSettings object', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: businessRow, error: null }))
      .mockReturnValueOnce(chainable({ data: widgetRow, error: null }));
    mockVerifiedBusiness(from);

    const result = await fetchWidgetSettings('biz-1');

    expect(result.settings).toEqual({
      publicWidgetId: 'widget-uuid-1',
      enabled: true,
      assistantName: 'Adria Assistant',
      welcomeMessageEn: 'Hi there!',
      welcomeMessageMe: '',
      welcomeMessageRu: '',
      primaryColor: '#1677ff',
      position: 'bottom-right',
      supportedLanguages: ['en', 'me'],
      humanHandoffEnabled: true,
      handoffEmail: 'owner@example.com',
      allowedOrigins: ['example.com']
    });
    expect(result.defaultLanguage).toBe('en');
  });

  it('converts a null handoff_email to an empty string', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(
        chainable({ data: { ...businessRow, handoff_email: null }, error: null })
      )
      .mockReturnValueOnce(chainable({ data: widgetRow, error: null }));
    mockVerifiedBusiness(from);

    const result = await fetchWidgetSettings('biz-1');

    expect(result.settings.handoffEmail).toBe('');
  });

  it('throws a friendly error when the business row is missing', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: null, error: null }))
      .mockReturnValueOnce(chainable({ data: widgetRow, error: null }));
    mockVerifiedBusiness(from);

    await expect(fetchWidgetSettings('biz-1')).rejects.toThrow(GENERIC_LOAD_ERROR);
  });

  it('throws a friendly error on a database failure, never a raw Supabase error', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: null, error: { message: 'db down' } }))
      .mockReturnValueOnce(chainable({ data: widgetRow, error: null }));
    mockVerifiedBusiness(from);

    await expect(fetchWidgetSettings('biz-1')).rejects.toThrow(GENERIC_LOAD_ERROR);
  });
});

describe('saveWidgetSettings', () => {
  it('propagates the authorization failure instead of writing anything — unauthenticated case', async () => {
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: false,
      error: SESSION_EXPIRED_MESSAGE
    });

    const result = await saveWidgetSettings('biz-1', 'en', validInput);

    expect(result).toEqual({ success: false, error: SESSION_EXPIRED_MESSAGE });
  });

  it('rejects a business id that is not the caller’s own without writing anything — cross-business case', async () => {
    const from = vi.fn();
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: false,
      error: "We couldn't find that business, or you don't have access to it."
    });

    const result = await saveWidgetSettings('biz-someone-elses', 'en', validInput);

    expect(result.success).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects input missing the default-language welcome message before writing anything', async () => {
    const from = vi.fn();
    mockVerifiedBusiness(from);

    const result = await saveWidgetSettings('biz-1', 'en', { ...validInput, welcomeMessageEn: '' });

    expect(result.success).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it('updates businesses then widget_settings, scoped to the verified business id, and returns success', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ error: null })) // businesses update
      .mockReturnValueOnce(chainable({ error: null })); // widget_settings update
    mockVerifiedBusiness(from);

    const result = await saveWidgetSettings(VERIFIED_BUSINESS_ID, 'en', validInput);

    expect(result).toEqual({ success: true });
    expect(from).toHaveBeenNthCalledWith(1, 'businesses');
    expect(from).toHaveBeenNthCalledWith(2, 'widget_settings');
  });

  it('returns a friendly error and stops if the businesses update fails', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ error: { message: 'db down' } }));
    mockVerifiedBusiness(from);

    const result = await saveWidgetSettings(VERIFIED_BUSINESS_ID, 'en', validInput);

    expect(result).toEqual({ success: false, error: GENERIC_SAVE_ERROR });
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('returns a friendly error if the widget_settings update fails', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ error: null }))
      .mockReturnValueOnce(chainable({ error: { message: 'db down' } }));
    mockVerifiedBusiness(from);

    const result = await saveWidgetSettings(VERIFIED_BUSINESS_ID, 'en', validInput);

    expect(result).toEqual({ success: false, error: GENERIC_SAVE_ERROR });
  });
});
