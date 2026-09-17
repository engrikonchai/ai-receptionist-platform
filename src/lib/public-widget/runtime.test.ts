import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { generateKnowledgeReply } from './knowledge-reply';
import { postMessage, startOrContinueSession, submitHandoffRequest } from './runtime';
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

const WIDGET_SETTINGS_A_HANDOFF_ENABLED = { ...WIDGET_SETTINGS_A, human_handoff_enabled: true };
const WIDGET_SETTINGS_B_HANDOFF_ENABLED = { ...WIDGET_SETTINGS_B, human_handoff_enabled: true };

/** Shared default claims (widget-a/conv-a-1/visitor-1 — no businessId; see session-token.ts) for the token-authorization test blocks below — override just the field under test. */
function tokenFor(overrides: Partial<Parameters<typeof issueWidgetSessionToken>[0]> = {}) {
  return issueWidgetSessionToken({
    publicWidgetId: 'widget-a',
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
      const [payloadB64] = result.sessionToken.split('.');
      expect(payloadB64).toBeDefined();
      const decoded = JSON.parse(Buffer.from(payloadB64!, 'base64url').toString('utf8'));
      expect(decoded).not.toHaveProperty('businessId');
      expect(decoded).not.toHaveProperty('business_id');
      expect(Object.keys(decoded).toSorted()).toEqual(
        ['conversationId', 'exp', 'iat', 'publicWidgetId', 'visitorId'].toSorted()
      );
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
      .mockReturnValueOnce(chainable({ data: null })) // active-handoff check: none found
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

  it('rejects a fully matching token (right widget, conversation, visitor) when the conversation row itself belongs to a different business — cross-business attempt', async () => {
    // The token carries no businessId at all (see session-token.ts) —
    // there is nothing in it to mismatch. The actual cross-business
    // guard is that loadOwnConversation() always queries scoped to
    // `widget.businessId`, freshly resolved here from publicWidgetId,
    // never a value carried by the token or sent by the browser. If the
    // conversation id in this request actually belongs to a different
    // business (e.g. reused across a widget reassignment, or simply
    // forged), that query returns no row even though every token claim
    // matches perfectly.
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A }))
      .mockReturnValueOnce(chainable({ data: null })); // conversations query, scoped to business-a, finds nothing
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
      .mockReturnValueOnce(chainable({ error: null })) // user message insert
      .mockReturnValueOnce(chainable({ data: null })) // active-handoff check: none found
      .mockReturnValueOnce(chainable({ error: null })); // assistant message insert
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    await postMessage({
      publicWidgetId: 'widget-b',
      visitorId: 'visitor-2',
      conversationId: 'conv-b-1',
      message: 'Any vacancies?',
      sessionToken: issueWidgetSessionToken({
        publicWidgetId: 'widget-b',
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

describe('submitHandoffRequest — the visitor-facing "Talk to a person" submit handler', () => {
  const validParams = {
    publicWidgetId: 'widget-a',
    visitorId: 'visitor-1',
    conversationId: 'conv-a-1',
    clientRequestId: 'client-request-1',
    name: 'Jane Visitor',
    email: 'jane@example.com',
    message: 'Please call me back',
    originHeader: 'https://a.example.com'
  };

  it('returns disabled, and never even attempts a session-token check, when human handoff is off for this widget', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A })); // human_handoff_enabled not set
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await submitHandoffRequest({ ...validParams, sessionToken: tokenFor() });

    expect(result).toEqual({ status: 'disabled' });
    expect(from).toHaveBeenCalledTimes(2);
  });

  it('rejects a wrong-origin request before ever checking the session token', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A_HANDOFF_ENABLED }));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await submitHandoffRequest({
      ...validParams,
      sessionToken: tokenFor(),
      originHeader: 'https://evil.example.com'
    });

    expect(result).toEqual({ status: 'origin_denied' });
  });

  it('rejects a token issued for a different widget (mismatched widget id)', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_B }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_B_HANDOFF_ENABLED }));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await submitHandoffRequest({
      ...validParams,
      publicWidgetId: 'widget-b',
      originHeader: 'https://b.example.com',
      sessionToken: tokenFor() // issued for widget-a
    });

    expect(result).toEqual({ status: 'unauthorized' });
    expect(from).toHaveBeenCalledTimes(2); // never reaches the conversations table
  });

  it('rejects an expired session token', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const expiredToken = tokenFor();
    vi.setSystemTime((4 * 60 * 60 + 1) * 1000);

    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A_HANDOFF_ENABLED }));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await submitHandoffRequest({ ...validParams, sessionToken: expiredToken });

    expect(result).toEqual({ status: 'unauthorized' });
  });

  it('rejects a tampered session token', async () => {
    const validToken = tokenFor();
    const [payloadB64] = validToken.split('.');
    const tamperedToken = `${payloadB64}.${'A'.repeat(43)}`;

    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A_HANDOFF_ENABLED }));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await submitHandoffRequest({ ...validParams, sessionToken: tamperedToken });

    expect(result).toEqual({ status: 'unauthorized' });
  });

  it('returns unavailable when WIDGET_SESSION_SECRET is not configured', async () => {
    delete process.env.WIDGET_SESSION_SECRET;
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A_HANDOFF_ENABLED }));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await submitHandoffRequest({ ...validParams, sessionToken: 'anything' });

    expect(result).toEqual({ status: 'unavailable' });
  });

  it('fails closed when the service-role client cannot be created for the write phase', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A_HANDOFF_ENABLED }));
    vi.mocked(createSupabaseServiceRoleClient)
      .mockReturnValueOnce(mockClient(from)) // resolveWidgetForRuntime's own client
      .mockReturnValueOnce(null); // the write-phase client

    const result = await submitHandoffRequest({ ...validParams, sessionToken: tokenFor() });

    expect(result).toEqual({ status: 'unavailable' });
  });

  it('rejects when the conversation id does not belong to this business + visitor', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A_HANDOFF_ENABLED }))
      .mockReturnValueOnce(chainable({ data: null })); // conversations query finds nothing
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await submitHandoffRequest({ ...validParams, sessionToken: tokenFor() });

    expect(result).toEqual({ status: 'unauthorized' });
    expect(from).toHaveBeenCalledTimes(3);
  });

  it('creates a lead and a pending handoff, marks the conversation handed off, and sends one acknowledgement — for a first-time submission with no existing lead', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A })) // businesses
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A_HANDOFF_ENABLED })) // widget_settings
      .mockReturnValueOnce(
        chainable({ data: { id: 'conv-a-1', detected_language: 'en', human_takeover: false } })
      ) // conversations (loadOwnConversation)
      .mockReturnValueOnce(chainable({ data: null })) // handoffs select by client_request_id: none found
      .mockReturnValueOnce(chainable({ data: null })) // leads select for this conversation: none found
      .mockReturnValueOnce(chainable({ error: null })) // leads insert
      .mockReturnValueOnce(chainable({ error: null })) // handoffs insert
      .mockReturnValueOnce(chainable({ error: null })) // conversations update
      .mockReturnValueOnce(chainable({ error: null })); // messages insert (acknowledgement)
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await submitHandoffRequest({ ...validParams, sessionToken: tokenFor() });

    expect(result).toEqual({ status: 'ok' });
    expect(from.mock.calls.map((call) => call[0])).toEqual([
      'businesses',
      'widget_settings',
      'conversations',
      'handoffs',
      'leads',
      'leads',
      'handoffs',
      'conversations',
      'messages'
    ]);
  });

  it('updates the existing lead for this conversation instead of creating a second one', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A_HANDOFF_ENABLED }))
      .mockReturnValueOnce(
        chainable({ data: { id: 'conv-a-1', detected_language: 'en', human_takeover: false } })
      )
      .mockReturnValueOnce(chainable({ data: null })) // idempotency check: none found
      .mockReturnValueOnce(chainable({ data: { id: 'lead-existing-1' } })) // leads select: found
      .mockReturnValueOnce(chainable({ error: null })) // leads update
      .mockReturnValueOnce(chainable({ error: null })) // handoffs insert
      .mockReturnValueOnce(chainable({ error: null })) // conversations update
      .mockReturnValueOnce(chainable({ error: null })); // messages insert
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await submitHandoffRequest({
      ...validParams,
      clientRequestId: 'client-request-2',
      sessionToken: tokenFor()
    });

    expect(result).toEqual({ status: 'ok' });
    expect(from).toHaveBeenCalledTimes(9);
  });

  it('returns ok without writing anything a second time for a replayed clientRequestId', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A_HANDOFF_ENABLED }))
      .mockReturnValueOnce(
        chainable({ data: { id: 'conv-a-1', detected_language: 'en', human_takeover: false } })
      )
      .mockReturnValueOnce(chainable({ data: { id: 'handoff-already-created' } })); // idempotency check: found
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await submitHandoffRequest({ ...validParams, sessionToken: tokenFor() });

    expect(result).toEqual({ status: 'ok' });
    expect(from).toHaveBeenCalledTimes(4); // never touches leads, never inserts a second handoff or message
  });

  it('treats a unique-violation race on insert (two identical concurrent submissions) as success, not an error', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A_HANDOFF_ENABLED }))
      .mockReturnValueOnce(
        chainable({ data: { id: 'conv-a-1', detected_language: 'en', human_takeover: false } })
      )
      .mockReturnValueOnce(chainable({ data: null })) // idempotency pre-check: not yet visible
      .mockReturnValueOnce(chainable({ data: null })) // leads select
      .mockReturnValueOnce(chainable({ error: null })) // leads insert
      .mockReturnValueOnce(chainable({ error: { code: '23505' } })); // handoffs insert: lost the race
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await submitHandoffRequest({ ...validParams, sessionToken: tokenFor() });

    expect(result).toEqual({ status: 'ok' });
    expect(from).toHaveBeenCalledTimes(7); // never updates the conversation or sends a second acknowledgement
  });

  it('fails closed when the handoff insert fails for a reason other than a duplicate', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A_HANDOFF_ENABLED }))
      .mockReturnValueOnce(
        chainable({ data: { id: 'conv-a-1', detected_language: 'en', human_takeover: false } })
      )
      .mockReturnValueOnce(chainable({ data: null }))
      .mockReturnValueOnce(chainable({ data: null }))
      .mockReturnValueOnce(chainable({ error: null }))
      .mockReturnValueOnce(chainable({ error: { code: 'XX000' } })); // handoffs insert: infrastructure error
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await submitHandoffRequest({ ...validParams, sessionToken: tokenFor() });

    expect(result).toEqual({ status: 'unavailable' });
  });

  it('scopes a second business’s handoff request to its own business — never leaks into business A’s data', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_B }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_B_HANDOFF_ENABLED }))
      .mockReturnValueOnce(
        chainable({ data: { id: 'conv-b-1', detected_language: 'en', human_takeover: false } })
      )
      .mockReturnValueOnce(chainable({ data: null }))
      .mockReturnValueOnce(chainable({ data: null }))
      .mockReturnValueOnce(chainable({ error: null }))
      .mockReturnValueOnce(chainable({ error: null }))
      .mockReturnValueOnce(chainable({ error: null }))
      .mockReturnValueOnce(chainable({ error: null }));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await submitHandoffRequest({
      publicWidgetId: 'widget-b',
      visitorId: 'visitor-2',
      conversationId: 'conv-b-1',
      clientRequestId: 'client-request-b-1',
      name: 'Business B Visitor',
      phone: '+1 555 000 1234',
      originHeader: 'https://b.example.com',
      sessionToken: issueWidgetSessionToken({
        publicWidgetId: 'widget-b',
        conversationId: 'conv-b-1',
        visitorId: 'visitor-2'
      })!
    });

    expect(result).toEqual({ status: 'ok' });
    expect(from).toHaveBeenCalledTimes(9);
  });
});
