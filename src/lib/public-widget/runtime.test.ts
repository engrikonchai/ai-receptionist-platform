import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { generateKnowledgeReply } from './knowledge-reply';
import { postMessage, startOrContinueSession } from './runtime';

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

beforeEach(() => {
  vi.mocked(createSupabaseServiceRoleClient).mockReset();
  vi.mocked(generateKnowledgeReply).mockReset().mockResolvedValue('Here is the answer.');
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

  it('returns unknown when the business exists but has no widget_settings row', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A }))
      .mockReturnValueOnce(chainable({ data: null }));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await startOrContinueSession({
      publicWidgetId: 'widget-a',
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

  it('returns disabled when the business is inactive, even with a matching origin', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: { ...BUSINESS_A, is_active: false } }))
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A }));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await startOrContinueSession({
      publicWidgetId: 'widget-a',
      visitorId: 'visitor-1',
      originHeader: 'https://a.example.com'
    });

    expect(result).toEqual({ status: 'disabled' });
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
});

describe('startOrContinueSession — conversation creation is scoped to the resolved business', () => {
  it('creates a new conversation using Business A’s id when Widget A starts a session', async () => {
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

    expect(result).toEqual({
      status: 'ok',
      conversationId: 'conv-a-1',
      messages: [{ role: 'assistant', text: 'Welcome to Business A!' }]
    });
    expect(from).toHaveBeenNthCalledWith(3, 'conversations');
  });

  it('never resumes a conversation id that belongs to a different business — starts a fresh one instead', async () => {
    // Widget A's own session request supplies a conversationId that
    // actually belongs to Business B (guessed, borrowed, or leaked from
    // another tab). loadOwnConversation filters by business_id = 'business-a',
    // so it finds nothing even though the id is real — proving Widget A can
    // never read into Business B's conversation.
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A })) // businesses
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A })) // widget_settings
      .mockReturnValueOnce(chainable({ data: null })) // loadOwnConversation — not found under business-a
      .mockReturnValueOnce(chainable({ data: { id: 'conv-a-new' }, error: null })) // fresh conversation insert
      .mockReturnValueOnce(chainable({ error: null })); // welcome message insert
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await startOrContinueSession({
      publicWidgetId: 'widget-a',
      visitorId: 'visitor-1',
      conversationId: 'conv-belongs-to-business-b',
      originHeader: 'https://a.example.com'
    });

    expect(result).toMatchObject({ status: 'ok', conversationId: 'conv-a-new' });
  });

  it('resumes an existing conversation that does belong to the resolved business, returning its full history', async () => {
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
      originHeader: 'https://a.example.com'
    });

    expect(result).toEqual({
      status: 'ok',
      conversationId: 'conv-a-1',
      messages: [
        { role: 'assistant', text: 'Welcome to Business A!' },
        { role: 'user', text: 'Hi' }
      ]
    });
  });
});

describe('postMessage — cross-tenant isolation', () => {
  it('returns conversation_not_found instead of writing anything when the conversation belongs to a different business', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: BUSINESS_A })) // businesses (resolved via widget A)
      .mockReturnValueOnce(chainable({ data: WIDGET_SETTINGS_A })) // widget_settings
      .mockReturnValueOnce(chainable({ data: null })); // loadOwnConversation under business-a — not found
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockClient(from));

    const result = await postMessage({
      publicWidgetId: 'widget-a',
      visitorId: 'visitor-1',
      conversationId: 'conv-belongs-to-business-b',
      message: 'Hello',
      originHeader: 'https://a.example.com'
    });

    expect(result).toEqual({ status: 'conversation_not_found' });
    expect(from).toHaveBeenCalledTimes(3);
  });

  it('generates the reply from the resolved business’s own knowledge — never another business’s', async () => {
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
      originHeader: 'https://a.example.com'
    });

    expect(result).toEqual({
      status: 'ok',
      messages: [{ role: 'assistant', text: 'Here is the answer.' }]
    });
    expect(generateKnowledgeReply).toHaveBeenCalledWith(
      expect.anything(),
      'business-a',
      'What time is check-in?',
      'en'
    );
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
      originHeader: 'https://a.example.com'
    });

    expect(result).toEqual({ status: 'ok', messages: [] });
    expect(generateKnowledgeReply).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledTimes(4);
  });

  it('Business B never sees Widget A’s traffic: resolving widget-b against origin b.example.com yields business-b, independent of widget-a/business-a', async () => {
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
