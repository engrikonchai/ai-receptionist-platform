import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { generateKnowledgeReply } from './knowledge-reply';
import { postMessage, startOrContinueSession } from './runtime';
import { issueWidgetSessionToken } from './session-token';

vi.mock('@/lib/supabase/service-role', () => ({
  createSupabaseServiceRoleClient: vi.fn()
}));

vi.mock('./knowledge-reply', () => ({
  generateKnowledgeReply: vi.fn()
}));

/** Same stand-in for Supabase's PostgREST query builder used across this repo's other service.test.ts files — every chained method call returns the proxy itself; awaiting it resolves to `result`. */
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

function mockClient(from: ReturnType<typeof vi.fn>): SupabaseClient {
  return { from } as unknown as SupabaseClient;
}

const ORIGINAL_ENV = { ...process.env };

// Two independent businesses, each with their own widget, used throughout
// to prove cross-tenant isolation.
const BUSINESS_A = { id: 'business-a', is_active: true, default_language: 'en' };
const BUSINESS_B = { id: 'business-b', is_active: true, default_language: 'en' };

const WIDGET_SETTINGS_A = {
  business_id: 'business-a',
  widget_enabled: true,
  allowed_origins: ['https://a.example.com'],
  welcome_message_en: 'Welcome to Business A!',
  welcome_message_me: null,
  welcome_message_ru: null
};

const WIDGET_SETTINGS_B = {
  business_id: 'business-b',
  widget_enabled: true,
  allowed_origins: ['https://b.example.com'],
  welcome_message_en: 'Welcome to Business B!',
  welcome_message_me: null,
  welcome_message_ru: null
};

/** Shared default claims (widget-a/business-a/conv-a-1/visitor-1) for the token-authorization test blocks below — override just the field under test. */
function tokenFor(overrides: Partial<Parameters<typeof issueWidgetSessionToken>[0]> = {}) {
  return issueWidgetSessionToken({
    publicWidgetId: 'widget-a',
    businessId: 'business-a',
    conversationId: 'conv-a-1',
    visitorId: 'visitor-1',
    ...overrides
  })!;
}

beforeEach(() => {
  process.env.WIDGET_SESSION_SECRET = 'test-session-secret-do-not-use-in-production';
  vi.mocked(createSupabaseServiceRoleClient).mockReset();
  vi.mocked(generateKnowledgeReply).mockReset().mockResolvedValue('Here is the answer.');
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.useRealTimers();
});

describe('startOrContinueSession — widget resolution', () => {
  it('returns unavailable when the service-role client cannot be created', async () => {
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(null);

    const result = await startOrContinueSession({
      publicWidgetId: 'widget-a',
      visitorId: 'visitor-1',
      originHeader: 'https://a.example.com'
    });

    expect(result).toEqual({ status: 'unavailable' });
  });

  it('returns unknown when no business matches the widget id', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await startOrContinueSession({
      publicWidgetId: 'no-such-widget',
      visitorId: 'visitor-1',
      originHeader: 'https://a.example.com'
    });

    expect(result).toEqual({ status: 'unknown' });
  });

  it('returns origin_denied when the request origin is not on this widget’s allow-list', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A }));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await startOrContinueSession({
      publicWidgetId: 'widget-a',
      visitorId: 'visitor-1',
      originHeader: 'https://b.example.com' // Business B's own allowed origin — never A's
    });

    expect(result).toEqual({ status: 'origin_denied' });
  });

  it('returns disabled when widget_enabled is false, even though mock_ai_enabled is a separate, unrelated column', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: { ...WIDGET_SETTINGS_A, widget_enabled: false } }));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await startOrContinueSession({
      publicWidgetId: 'widget-a',
      visitorId: 'visitor-1',
      originHeader: 'https://a.example.com'
    });

    expect(result).toEqual({ status: 'disabled' });
  });

  it('returns unavailable when WIDGET_SESSION_SECRET is not configured — never issues an unsigned token', async () => {
    delete process.env.WIDGET_SESSION_SECRET;
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A }));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await startOrContinueSession({
      publicWidgetId: 'widget-a',
      visitorId: 'visitor-1',
      originHeader: 'https://a.example.com'
    });

    expect(result).toEqual({ status: 'unavailable' });
  });
});

describe('startOrContinueSession — new conversations are scoped to the resolved business and issue a session token', () => {
  it('creates a new conversation using Business A’s id and returns a session token, never a separate businessId field', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A })) // businesses
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A })) // widget_settings
      .mockReturnValueOnce(chainable({ data: { id: 'conv-a-1' }, error: null })) // conversations insert
      .mockReturnValueOnce(chainable({ error: null })); // messages insert (welcome)
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await startOrContinueSession({
      publicWidgetId: 'widget-a',
      visitorId: 'visitor-1',
      originHeader: 'https://a.example.com'
    });

    expect(result).toMatchObject({
      status: 'ok',
      conversationId: 'conv-a-1',
      messages: [{ role: 'assistant', text: 'Welcome to Business A!' }]
    });
    expect(result).not.toHaveProperty('businessId');
    if (result.status === 'ok') {
      expect(typeof result.sessionToken).toBe('string');
      expect(result.sessionToken.split('.')).toHaveLength(2);
    }
    expect(from).toHaveBeenNthCalledWith(3, 'conversations');
  });

  it('without a valid session token, never resumes a supplied conversation id — starts a fresh one even if it happens to belong to this same business', async () => {
    // No sessionToken at all is functionally identical to a forged one:
    // tokenMatchesResumeRequest() rejects it, so loadOwnConversation is
    // never even attempted — only 4 `from` calls, not 5.
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A }))
      .mockReturnValueOnce(chainable({ data: { id: 'conv-a-new' }, error: null }))
      .mockReturnValueOnce(chainable({ error: null }));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await startOrContinueSession({
      publicWidgetId: 'widget-a',
      visitorId: 'visitor-1',
      conversationId: 'conv-a-old',
      originHeader: 'https://a.example.com'
    });

    expect(result).toMatchObject({ status: 'ok', conversationId: 'conv-a-new' });
    expect(from).toHaveBeenCalledTimes(4);
  });
});

describe('startOrContinueSession — resuming requires a fully matching session token', () => {
  it('resumes an existing conversation when the token fully matches the request and resolved business', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A }))
      .mockReturnValueOnce(
        chainable({ data: { id: 'conv-a-1', detected_language: 'en', human_takeover: false } })
      )
      .mockReturnValueOnce(
        chainable({
          data: [
            { role: 'assistant', content: 'Welcome to Business A!' },
            { role: 'user', content: 'Hi' }
          ]
        })
      );
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await startOrContinueSession({
      publicWidgetId: 'widget-a',
      visitorId: 'visitor-1',
      conversationId: 'conv-a-1',
      sessionToken: tokenFor(),
      originHeader: 'https://a.example.com'
    });

    expect(result).toMatchObject({
      status: 'ok',
      conversationId: 'conv-a-1',
      messages: [
        { role: 'assistant', text: 'Welcome to Business A!' },
        { role: 'user', text: 'Hi' }
      ]
    });
  });

  it('falls back to a fresh conversation when the token’s conversationId does not match the request’s', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A }))
      .mockReturnValueOnce(chainable({ data: { id: 'conv-a-new' }, error: null }))
      .mockReturnValueOnce(chainable({ error: null }));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await startOrContinueSession({
      publicWidgetId: 'widget-a',
      visitorId: 'visitor-1',
      conversationId: 'conv-a-DIFFERENT',
      sessionToken: tokenFor({ conversationId: 'conv-a-1' }),
      originHeader: 'https://a.example.com'
    });

    expect(result).toMatchObject({ status: 'ok', conversationId: 'conv-a-new' });
  });

  it('falls back to a fresh conversation when the token’s visitorId does not match the request’s (one visitor can never resume another’s conversation)', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A }))
      .mockReturnValueOnce(chainable({ data: { id: 'conv-a-new' }, error: null }))
      .mockReturnValueOnce(chainable({ error: null }));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await startOrContinueSession({
      publicWidgetId: 'widget-a',
      visitorId: 'visitor-2', // someone else's browser, someone else's visitorId
      conversationId: 'conv-a-1',
      sessionToken: tokenFor({ visitorId: 'visitor-1' }), // a token stolen/guessed from visitor-1
      originHeader: 'https://a.example.com'
    });

    expect(result).toMatchObject({ status: 'ok', conversationId: 'conv-a-new' });
  });

  it('falls back to a fresh conversation when the token was issued for a different widget entirely', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_B }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_B }))
      .mockReturnValueOnce(chainable({ data: { id: 'conv-b-new' }, error: null }))
      .mockReturnValueOnce(chainable({ error: null }));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await startOrContinueSession({
      publicWidgetId: 'widget-b',
      visitorId: 'visitor-1',
      conversationId: 'conv-a-1',
      sessionToken: tokenFor(), // issued for widget-a/business-a
      originHeader: 'https://b.example.com'
    });

    expect(result).toMatchObject({ status: 'ok', conversationId: 'conv-b-new' });
  });

  it('falls back to a fresh conversation when the token has been tampered with', async () => {
    const validToken = tokenFor();
    const [payloadB64, signatureB64] = validToken.split('.');
    // Re-encode the exact same claims, byte-identical except for one
    // trailing space — proving the signature is over the payload
    // bytes, not just the logical claim values: even a no-op-looking
    // re-serialization invalidates it.
    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const tamperedPayloadB64 = Buffer.from(`${payloadJson} `, 'utf8').toString('base64url');
    const tamperedToken = `${tamperedPayloadB64}.${signatureB64}`;

    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A }))
      .mockReturnValueOnce(chainable({ data: { id: 'conv-a-new' }, error: null }))
      .mockReturnValueOnce(chainable({ error: null }));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await startOrContinueSession({
      publicWidgetId: 'widget-a',
      visitorId: 'visitor-1',
      conversationId: 'conv-a-1',
      sessionToken: tamperedToken,
      originHeader: 'https://a.example.com'
    });

    expect(result).toMatchObject({ status: 'ok', conversationId: 'conv-a-new' });
  });

  it('falls back to a fresh conversation when the token has expired', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const expiredToken = tokenFor();
    vi.setSystemTime((4 * 60 * 60 + 1) * 1000);

    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A }))
      .mockReturnValueOnce(chainable({ data: { id: 'conv-a-new' }, error: null }))
      .mockReturnValueOnce(chainable({ error: null }));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await startOrContinueSession({
      publicWidgetId: 'widget-a',
      visitorId: 'visitor-1',
      conversationId: 'conv-a-1',
      sessionToken: expiredToken,
      originHeader: 'https://a.example.com'
    });

    expect(result).toMatchObject({ status: 'ok', conversationId: 'conv-a-new' });
  });
});

describe('postMessage — session-token authorization', () => {
  it('accepts a valid, fully matching signed session and returns the assistant reply', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A }))
      .mockReturnValueOnce(
        chainable({ data: { id: 'conv-a-1', detected_language: 'en', human_takeover: false } })
      )
      .mockReturnValueOnce(chainable({ error: null })) // user message insert
      .mockReturnValueOnce(chainable({ error: null })); // assistant message insert
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await postMessage({
      publicWidgetId: 'widget-a',
      visitorId: 'visitor-1',
      conversationId: 'conv-a-1',
      message: 'What time is check-in?',
      sessionToken: tokenFor(),
      originHeader: 'https://a.example.com'
    });

    expect(result).toEqual({
      status: 'ok',
      messages: [{ role: 'assistant', text: 'Here is the answer.' }]
    });
  });

  it('rejects a request with no session token, without ever touching the database', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A }));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await postMessage({
      publicWidgetId: 'widget-a',
      visitorId: 'visitor-1',
      conversationId: 'conv-a-1',
      message: 'Hello',
      sessionToken: '',
      originHeader: 'https://a.example.com'
    });

    expect(result).toEqual({ status: 'unauthorized' });
    expect(from).toHaveBeenCalledTimes(2); // only the widget resolution — never the conversation table
  });

  it('rejects a tampered token', async () => {
    const validToken = tokenFor();
    const [payloadB64] = validToken.split('.');
    const tamperedToken = `${payloadB64}.${'A'.repeat(43)}`;

    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A }));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await postMessage({
      publicWidgetId: 'widget-a',
      visitorId: 'visitor-1',
      conversationId: 'conv-a-1',
      message: 'Hello',
      sessionToken: tamperedToken,
      originHeader: 'https://a.example.com'
    });

    expect(result).toEqual({ status: 'unauthorized' });
  });

  it('rejects an expired token', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const expiredToken = tokenFor();
    vi.setSystemTime((4 * 60 * 60 + 1) * 1000);

    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A }));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await postMessage({
      publicWidgetId: 'widget-a',
      visitorId: 'visitor-1',
      conversationId: 'conv-a-1',
      message: 'Hello',
      sessionToken: expiredToken,
      originHeader: 'https://a.example.com'
    });

    expect(result).toEqual({ status: 'unauthorized' });
  });

  it('rejects a token issued for a different widget (wrong widget)', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_B }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_B }));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await postMessage({
      publicWidgetId: 'widget-b',
      visitorId: 'visitor-1',
      conversationId: 'conv-a-1',
      message: 'Hello',
      sessionToken: tokenFor(), // issued for widget-a
      originHeader: 'https://b.example.com'
    });

    expect(result).toEqual({ status: 'unauthorized' });
  });

  it('rejects a token issued for a different conversation (wrong conversation)', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A }));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await postMessage({
      publicWidgetId: 'widget-a',
      visitorId: 'visitor-1',
      conversationId: 'conv-a-OTHER',
      message: 'Hello',
      sessionToken: tokenFor({ conversationId: 'conv-a-1' }),
      originHeader: 'https://a.example.com'
    });

    expect(result).toEqual({ status: 'unauthorized' });
  });

  it('rejects a token issued for a different visitor (wrong visitor / cross-visitor attempt)', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A }));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await postMessage({
      publicWidgetId: 'widget-a',
      visitorId: 'visitor-2',
      conversationId: 'conv-a-1',
      message: 'Hello',
      sessionToken: tokenFor({ visitorId: 'visitor-1' }),
      originHeader: 'https://a.example.com'
    });

    expect(result).toEqual({ status: 'unauthorized' });
    expect(from).toHaveBeenCalledTimes(2); // never reaches the conversations table
  });

  it('rejects a token whose businessId does not match the freshly resolved business (cross-business attempt)', async () => {
    // A token minted (hypothetically forged, or replayed from a prior
    // widget/business reassignment) claiming business-b while the
    // widget id in this request resolves to business-a.
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A }));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await postMessage({
      publicWidgetId: 'widget-a',
      visitorId: 'visitor-1',
      conversationId: 'conv-a-1',
      message: 'Hello',
      sessionToken: tokenFor({ businessId: 'business-b' }),
      originHeader: 'https://a.example.com'
    });

    expect(result).toEqual({ status: 'unauthorized' });
  });

  it('rejects even a fully matching token if the conversation row itself does not belong to that business+visitor — the token is not the only check', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A }))
      .mockReturnValueOnce(chainable({ data: null })); // conversations query itself finds no matching row
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await postMessage({
      publicWidgetId: 'widget-a',
      visitorId: 'visitor-1',
      conversationId: 'conv-a-1',
      message: 'Hello',
      sessionToken: tokenFor(),
      originHeader: 'https://a.example.com'
    });

    expect(result).toEqual({ status: 'unauthorized' });
  });

  it('never generates or inserts an automated reply while a human owner has taken over the conversation', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A }))
      .mockReturnValueOnce(
        chainable({ data: { id: 'conv-a-1', detected_language: 'en', human_takeover: true } })
      )
      .mockReturnValueOnce(chainable({ error: null })); // user message insert only
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await postMessage({
      publicWidgetId: 'widget-a',
      visitorId: 'visitor-1',
      conversationId: 'conv-a-1',
      message: 'Hello',
      sessionToken: tokenFor(),
      originHeader: 'https://a.example.com'
    });

    expect(result).toEqual({ status: 'ok', messages: [] });
    expect(generateKnowledgeReply).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledTimes(4);
  });

  it('generates the reply from the resolved business’s own knowledge — never another business’s', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_B }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_B }))
      .mockReturnValueOnce(
        chainable({ data: { id: 'conv-b-1', detected_language: 'en', human_takeover: false } })
      )
      .mockReturnValueOnce(chainable({ error: null }))
      .mockReturnValueOnce(chainable({ error: null }));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    await postMessage({
      publicWidgetId: 'widget-b',
      visitorId: 'visitor-2',
      conversationId: 'conv-b-1',
      message: 'Any vacancies?',
      sessionToken: issueWidgetSessionToken({
        publicWidgetId: 'widget-b',
        businessId: 'business-b',
        conversationId: 'conv-b-1',
        visitorId: 'visitor-2'
      })!,
      originHeader: 'https://b.example.com'
    });

    expect(generateKnowledgeReply).toHaveBeenCalledWith(
      expect.anything(),
      'business-b',
      'Any vacancies?',
      'en'
    );
  });
});
