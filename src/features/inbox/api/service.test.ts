import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { verifyActiveBusiness } from './authorize';
import { SESSION_EXPIRED_MESSAGE } from './types';
import {
  fetchConversationMessages,
  fetchConversations,
  fetchHandoffForConversation,
  fetchLeadForConversation,
  reopenConversation,
  resolveConversation,
  returnToAIConversation,
  takeOverConversation
} from './service';

vi.mock('./authorize', () => ({
  verifyActiveBusiness: vi.fn()
}));

/**
 * A stand-in for Supabase's PostgREST query builder: every method call
 * (`select`, `eq`, `order`, `limit`, `in`, `update`, ...) returns the
 * same chainable object regardless of order, and `await`-ing it at any
 * point resolves to the configured `{ data, error }` result — exactly
 * like the real builder, which is chainable *and* thenable. This lets
 * one helper stand in for every query shape `service.ts` builds instead
 * of hand-replicating each chain.
 */
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
const VERIFIED_BUSINESS_ID = 'biz-1';

function mockVerifiedBusiness(from: ReturnType<typeof vi.fn>) {
  vi.mocked(verifyActiveBusiness).mockResolvedValue({
    ok: true,
    ctx: {
      supabase: { from } as unknown as SupabaseClient,
      user: stubUser,
      businessId: VERIFIED_BUSINESS_ID
    }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchConversations', () => {
  it('propagates the authorization failure instead of querying anything', async () => {
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: false,
      error: SESSION_EXPIRED_MESSAGE
    });

    await expect(fetchConversations('biz-1')).rejects.toThrow(SESSION_EXPIRED_MESSAGE);
  });

  it('returns an empty list without querying messages, leads or handoffs when there are no conversations', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: [], error: null }));
    mockVerifiedBusiness(from);

    const result = await fetchConversations('biz-1');

    expect(result).toEqual([]);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('enriches each conversation with its lead name, latest message preview and handoff status, and never returns the raw visitor id', async () => {
    const conversationRow = {
      id: 'conv-1',
      business_id: VERIFIED_BUSINESS_ID,
      visitor_id: 'visitor-secret-uuid-9f8e7d6c',
      channel: 'website',
      detected_language: 'en',
      status: 'open',
      human_takeover: false,
      lead_created: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z'
    };

    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: [conversationRow], error: null })) // conversations
      .mockReturnValueOnce(
        chainable({
          data: [
            {
              conversation_id: 'conv-1',
              content: 'Newest message',
              created_at: '2026-01-02T00:00:00Z'
            },
            {
              conversation_id: 'conv-1',
              content: 'Older message',
              created_at: '2026-01-01T12:00:00Z'
            }
          ],
          error: null
        })
      ) // messages, newest first
      .mockReturnValueOnce(
        chainable({
          data: [
            { conversation_id: 'conv-1', name: 'Sarah Bennett', contact: 'sarah@example.com' }
          ],
          error: null
        })
      ) // leads
      .mockReturnValueOnce(
        chainable({ data: [{ conversation_id: 'conv-1', status: 'new' }], error: null })
      ); // handoffs

    mockVerifiedBusiness(from);

    const [item] = await fetchConversations('biz-1');

    expect(item.displayName).toBe('Sarah Bennett');
    expect(item.hasLeadName).toBe(true);
    expect(item.leadContact).toBe('sarah@example.com');
    expect(item.latestMessagePreview).toBe('Newest message');
    expect(item.handoffStatus).toBe('new');
    expect(item.maskedVisitorId).not.toContain(conversationRow.visitor_id);
    expect(JSON.stringify(item)).not.toContain(conversationRow.visitor_id);
  });

  it('falls back to a masked, channel-neutral name and null handoff status when there is no lead or handoff', async () => {
    const conversationRow = {
      id: 'conv-2',
      business_id: VERIFIED_BUSINESS_ID,
      visitor_id: 'anonymous-visitor-id-123456',
      channel: 'whatsapp',
      detected_language: 'ru',
      status: 'open',
      human_takeover: false,
      lead_created: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z'
    };

    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: [conversationRow], error: null }))
      .mockReturnValueOnce(chainable({ data: [], error: null }))
      .mockReturnValueOnce(chainable({ data: [], error: null }))
      .mockReturnValueOnce(chainable({ data: [], error: null }));

    mockVerifiedBusiness(from);

    const [item] = await fetchConversations('biz-1');

    expect(item.displayName).toBe('WhatsApp visitor an••••3456');
    expect(item.hasLeadName).toBe(false);
    expect(item.leadContact).toBeNull();
    expect(item.handoffStatus).toBeNull();
    expect(item.latestMessagePreview).toBeNull();
  });

  it('throws a generic error when the primary conversations query fails', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: null, error: { message: 'db down' } }));
    mockVerifiedBusiness(from);

    await expect(fetchConversations('biz-1')).rejects.toThrow(
      'We could not load conversations. Please try again.'
    );
  });
});

describe('fetchConversationMessages', () => {
  it('propagates the authorization failure', async () => {
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: false,
      error: SESSION_EXPIRED_MESSAGE
    });

    await expect(fetchConversationMessages('biz-1', 'conv-1')).rejects.toThrow(
      SESSION_EXPIRED_MESSAGE
    );
  });

  it('reports not_found instead of leaking data for a conversation belonging to another business', async () => {
    // The ownership check (`.eq('business_id', verifiedId).eq('id', conversationId)`)
    // finds no row — exactly what happens whether the conversation was
    // deleted or belongs to a different business than the one verified.
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null, error: null }));
    mockVerifiedBusiness(from);

    const result = await fetchConversationMessages('biz-1', 'conv-from-another-business');

    expect(result).toEqual({ status: 'not_found' });
    // Never queries messages for a conversation it couldn't verify ownership of.
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('returns the ordered messages for a conversation that does belong to the business', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: { id: 'conv-1' }, error: null })) // ownership check
      .mockReturnValueOnce(
        chainable({
          data: [
            { id: 'm1', role: 'user', content: 'Hi', created_at: '2026-01-01T00:00:00Z' },
            { id: 'm2', role: 'assistant', content: 'Hello!', created_at: '2026-01-01T00:01:00Z' }
          ],
          error: null
        })
      );
    mockVerifiedBusiness(from);

    const result = await fetchConversationMessages('biz-1', 'conv-1');

    expect(result).toEqual({
      status: 'ok',
      messages: [
        { id: 'm1', role: 'user', content: 'Hi', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'm2', role: 'assistant', content: 'Hello!', createdAt: '2026-01-01T00:01:00Z' }
      ]
    });
  });

  it('throws a generic error when the messages query fails', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: { id: 'conv-1' }, error: null }))
      .mockReturnValueOnce(chainable({ data: null, error: { message: 'db down' } }));
    mockVerifiedBusiness(from);

    await expect(fetchConversationMessages('biz-1', 'conv-1')).rejects.toThrow(
      'We could not load this conversation. Please try again.'
    );
  });
});

describe('fetchLeadForConversation', () => {
  it('returns not_found when no lead has been captured', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null, error: null }));
    mockVerifiedBusiness(from);

    const result = await fetchLeadForConversation('biz-1', 'conv-1');

    expect(result).toEqual({ status: 'not_found' });
  });

  it('maps a found lead row to LeadDetails', async () => {
    const from = vi.fn().mockReturnValueOnce(
      chainable({
        data: {
          name: 'Sarah Bennett',
          contact: 'sarah@example.com',
          check_in: '2026-08-14',
          check_out: '2026-08-21',
          guest_count: 4,
          note: null,
          language: 'en',
          source: 'website',
          status: 'new'
        },
        error: null
      })
    );
    mockVerifiedBusiness(from);

    const result = await fetchLeadForConversation('biz-1', 'conv-1');

    expect(result).toEqual({
      status: 'ok',
      lead: {
        name: 'Sarah Bennett',
        contact: 'sarah@example.com',
        checkIn: '2026-08-14',
        checkOut: '2026-08-21',
        guestCount: 4,
        note: null,
        language: 'en',
        source: 'website',
        status: 'new'
      }
    });
  });
});

describe('fetchHandoffForConversation', () => {
  it('returns not_found when no handoff was requested', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null, error: null }));
    mockVerifiedBusiness(from);

    const result = await fetchHandoffForConversation('biz-1', 'conv-1');

    expect(result).toEqual({ status: 'not_found' });
  });

  it('maps a found handoff row to HandoffDetails', async () => {
    const from = vi.fn().mockReturnValueOnce(
      chainable({
        data: {
          customer_name: 'Nikola Radulović',
          contact: '+382 67 123 456',
          question: 'Do you offer a returning-guest discount?',
          reason: 'Pricing question outside the assistant’s rules',
          status: 'new'
        },
        error: null
      })
    );
    mockVerifiedBusiness(from);

    const result = await fetchHandoffForConversation('biz-1', 'conv-1');

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.handoff.customerName).toBe('Nikola Radulović');
      expect(result.handoff.status).toBe('new');
    }
  });
});

describe('conversation actions (take over / return to AI / resolve / reopen)', () => {
  it('returns a failure result — not a throw — when authorization fails, for every action', async () => {
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: false,
      error: SESSION_EXPIRED_MESSAGE
    });

    await expect(takeOverConversation('biz-1', 'conv-1')).resolves.toEqual({
      success: false,
      error: SESSION_EXPIRED_MESSAGE
    });
    await expect(returnToAIConversation('biz-1', 'conv-1')).resolves.toEqual({
      success: false,
      error: SESSION_EXPIRED_MESSAGE
    });
    await expect(resolveConversation('biz-1', 'conv-1')).resolves.toEqual({
      success: false,
      error: SESSION_EXPIRED_MESSAGE
    });
    await expect(reopenConversation('biz-1', 'conv-1')).resolves.toEqual({
      success: false,
      error: SESSION_EXPIRED_MESSAGE
    });
  });

  it('fails safely instead of silently succeeding when the update matches no row — the cross-business ownership guard', async () => {
    // Simulates a conversation id that belongs to a different business:
    // `.eq('business_id', verifiedId).eq('id', conversationId)` matches
    // nothing, so the update affects zero rows.
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null, error: null }));
    mockVerifiedBusiness(from);

    const result = await takeOverConversation('biz-1', 'conv-from-another-business');

    expect(result).toEqual({
      success: false,
      error: 'This conversation is no longer available.'
    });
  });

  it('reports a generic failure when the update itself errors', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: null, error: { message: 'db down' } }));
    mockVerifiedBusiness(from);

    const result = await resolveConversation('biz-1', 'conv-1');

    expect(result).toEqual({ success: false, error: 'Something went wrong. Please try again.' });
  });

  it('succeeds when the update matches the conversation', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: { id: 'conv-1' }, error: null }));
    mockVerifiedBusiness(from);

    await expect(reopenConversation('biz-1', 'conv-1')).resolves.toEqual({ success: true });
  });
});
