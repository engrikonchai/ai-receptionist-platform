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
  sendHumanReply,
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
  // service.ts logs safe, temporary diagnostics (see logInboxQueryDiagnostic)
  // on every fetchConversations call — silence them so test output stays
  // readable; the diagnostics' content itself isn't what these tests verify.
  vi.spyOn(console, 'error').mockImplementation(() => {});
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

  /**
   * Regression test for the "Inbox shows 0 conversations despite RLS
   * returning 5 rows" investigation: the primary conversations query can
   * succeed with real rows while one enrichment query (messages, leads,
   * or handoffs) fails — e.g. a table whose RLS policy isn't applied yet
   * in a given environment. That must degrade gracefully (drop just that
   * enrichment, e.g. no lead name or handoff status) instead of losing
   * every conversation the primary query already found.
   */
  it('still returns every conversation when the leads enrichment query fails, degrading gracefully instead of discarding the list', async () => {
    const conversationRow = {
      id: 'conv-1',
      business_id: VERIFIED_BUSINESS_ID,
      visitor_id: 'visitor-1',
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
      .mockReturnValueOnce(chainable({ data: [], error: null })) // messages
      .mockReturnValueOnce(
        chainable({
          data: null,
          error: { code: '42501', message: 'permission denied for table leads' }
        })
      ) // leads — fails
      .mockReturnValueOnce(chainable({ data: [], error: null })); // handoffs

    mockVerifiedBusiness(from);

    const result = await fetchConversations('biz-1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('conv-1');
    expect(result[0].hasLeadName).toBe(false);
    expect(result[0].leadContact).toBeNull();
  });

  it('still returns every conversation when the messages and handoffs enrichment queries also fail', async () => {
    const conversationRow = {
      id: 'conv-1',
      business_id: VERIFIED_BUSINESS_ID,
      visitor_id: 'visitor-1',
      channel: 'website',
      detected_language: 'en',
      status: 'open',
      human_takeover: false,
      lead_created: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z'
    };
    const dbError = { code: '42501', message: 'permission denied' };

    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: [conversationRow], error: null })) // conversations
      .mockReturnValueOnce(chainable({ data: null, error: dbError })) // messages — fails
      .mockReturnValueOnce(chainable({ data: null, error: dbError })) // leads — fails
      .mockReturnValueOnce(chainable({ data: null, error: dbError })); // handoffs — fails

    mockVerifiedBusiness(from);

    const result = await fetchConversations('biz-1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('conv-1');
    expect(result[0].latestMessagePreview).toBeNull();
    expect(result[0].handoffStatus).toBeNull();
  });

  /**
   * Regression test using the exact ids from the reported production
   * case: a business with 5 conversations, visible through RLS, must
   * come back as 5 items — not the empty array the production bug
   * showed.
   */
  it('returns all 5 conversations for the reported business — the exact production regression', async () => {
    const REPORTED_BUSINESS_ID = 'c35003d0-6956-47d2-9f9b-1fc1dc10090b';
    const conversationRows = Array.from({ length: 5 }, (_, i) => ({
      id: `conv-${i + 1}`,
      business_id: REPORTED_BUSINESS_ID,
      visitor_id: `visitor-${i + 1}`,
      channel: 'website',
      detected_language: 'en',
      status: 'open',
      human_takeover: false,
      lead_created: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z'
    }));

    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: conversationRows, error: null })) // conversations
      .mockReturnValueOnce(chainable({ data: [], error: null })) // messages
      .mockReturnValueOnce(chainable({ data: [], error: null })) // leads
      .mockReturnValueOnce(chainable({ data: [], error: null })); // handoffs

    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: true,
      ctx: {
        supabase: { from } as unknown as SupabaseClient,
        user: stubUser,
        businessId: REPORTED_BUSINESS_ID
      }
    });

    const result = await fetchConversations(REPORTED_BUSINESS_ID);

    expect(result).toHaveLength(5);
    expect(result.map((c) => c.id)).toEqual(['conv-1', 'conv-2', 'conv-3', 'conv-4', 'conv-5']);
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

  it('returns the ordered messages for a conversation that does belong to the business, resolving sender_type', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: { id: 'conv-1' }, error: null })) // ownership check
      .mockReturnValueOnce(
        chainable({
          data: [
            {
              id: 'm1',
              role: 'user',
              content: 'Hi',
              sender_type: null,
              created_at: '2026-01-01T00:00:00Z'
            },
            {
              id: 'm2',
              role: 'assistant',
              content: 'Hello! (AI, pre-migration row)',
              sender_type: null,
              created_at: '2026-01-01T00:01:00Z'
            },
            {
              id: 'm3',
              role: 'assistant',
              content: 'Hi, this is the owner.',
              sender_type: 'human',
              created_at: '2026-01-01T00:02:00Z'
            }
          ],
          error: null
        })
      );
    mockVerifiedBusiness(from);

    const result = await fetchConversationMessages('biz-1', 'conv-1');

    expect(result).toEqual({
      status: 'ok',
      messages: [
        {
          id: 'm1',
          role: 'user',
          content: 'Hi',
          senderType: null,
          createdAt: '2026-01-01T00:00:00Z'
        },
        {
          id: 'm2',
          role: 'assistant',
          content: 'Hello! (AI, pre-migration row)',
          // Backward compatibility: a null sender_type on an assistant
          // row must always resolve to 'ai', never leak as null.
          senderType: 'ai',
          createdAt: '2026-01-01T00:01:00Z'
        },
        {
          id: 'm3',
          role: 'assistant',
          content: 'Hi, this is the owner.',
          senderType: 'human',
          createdAt: '2026-01-01T00:02:00Z'
        }
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

describe('sendHumanReply', () => {
  const CONVERSATION_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
  const CLIENT_MESSAGE_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa7';

  const validInput = {
    businessId: 'biz-1',
    conversationId: CONVERSATION_ID,
    clientMessageId: CLIENT_MESSAGE_ID,
    content: 'Hi, this is the owner replying.'
  };

  it('rejects an unauthenticated send — never queries anything', async () => {
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: false,
      error: SESSION_EXPIRED_MESSAGE
    });

    const result = await sendHumanReply(validInput);

    expect(result).toEqual({ success: false, error: SESSION_EXPIRED_MESSAGE });
  });

  it('always verifies the exact business id it was given — a client-supplied business_id can never control authorization on its own', async () => {
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: false,
      error: 'We couldn’t find that business, or you don’t have access to it.'
    });

    await sendHumanReply({ ...validInput, businessId: 'someone-elses-business' });

    expect(verifyActiveBusiness).toHaveBeenCalledWith('someone-elses-business');
    expect(verifyActiveBusiness).toHaveBeenCalledTimes(1);
  });

  it('reports the conversation as unavailable instead of leaking data when it belongs to another business', async () => {
    // `.eq('business_id', verifiedId).eq('id', conversationId)` finds no
    // row — exactly what happens whether the id was deleted or belongs
    // to a business other than the one verified.
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null, error: null }));
    mockVerifiedBusiness(from);

    const result = await sendHumanReply(validInput);

    expect(result).toEqual({ success: false, error: 'This conversation is no longer available.' });
    // Never attempts an insert for a conversation it couldn't verify.
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('rejects a blank message before ever touching the database', async () => {
    const from = vi.fn();
    mockVerifiedBusiness(from);

    const result = await sendHumanReply({ ...validInput, content: '   ' });

    expect(result).toEqual({ success: false, error: 'Enter a message before sending.' });
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects a message over 4000 characters before ever touching the database', async () => {
    const from = vi.fn();
    mockVerifiedBusiness(from);

    const result = await sendHumanReply({ ...validInput, content: 'a'.repeat(4001) });

    expect(result).toEqual({
      success: false,
      error: 'Keep replies under 4000 characters.'
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('accepts a message at exactly the 4000 character limit', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(
        chainable({
          data: { id: CONVERSATION_ID, status: 'open', human_takeover: true },
          error: null
        })
      )
      .mockReturnValueOnce(
        chainable({
          data: {
            id: 'm-new',
            role: 'assistant',
            content: 'a'.repeat(4000),
            sender_type: 'human',
            created_at: '2026-01-01T00:00:00Z'
          },
          error: null
        })
      );
    mockVerifiedBusiness(from);

    const result = await sendHumanReply({ ...validInput, content: 'a'.repeat(4000) });

    expect(result.success).toBe(true);
  });

  it('refuses to send into a resolved/closed conversation', async () => {
    const from = vi.fn().mockReturnValueOnce(
      chainable({
        data: { id: CONVERSATION_ID, status: 'closed', human_takeover: true },
        error: null
      })
    );
    mockVerifiedBusiness(from);

    const result = await sendHumanReply(validInput);

    expect(result).toEqual({
      success: false,
      error: 'This conversation is resolved. Reopen it to reply.'
    });
    // Never attempts an insert into a closed conversation.
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('refuses to send before the owner has taken the conversation over', async () => {
    const from = vi.fn().mockReturnValueOnce(
      chainable({
        data: { id: CONVERSATION_ID, status: 'open', human_takeover: false },
        error: null
      })
    );
    mockVerifiedBusiness(from);

    const result = await sendHumanReply(validInput);

    expect(result).toEqual({
      success: false,
      error: 'Take over this conversation before sending a reply.'
    });
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('inserts role=assistant, sender_type=human after a successful takeover, and returns the new message', async () => {
    let insertPayload: Record<string, unknown> | undefined;
    const from = vi.fn((table: string) => {
      if (table === 'conversations') {
        return chainable({
          data: { id: CONVERSATION_ID, status: 'open', human_takeover: true },
          error: null
        });
      }
      // Capture exactly what was passed to messages.insert(...) via a
      // thin wrapper around the generic chainable() stub.
      return {
        insert: (payload: Record<string, unknown>) => {
          insertPayload = payload;
          return chainable({
            data: {
              id: 'm-new',
              role: 'assistant',
              content: validInput.content,
              sender_type: 'human',
              created_at: '2026-01-01T00:00:00Z'
            },
            error: null
          });
        }
      };
    });
    mockVerifiedBusiness(from);

    const result = await sendHumanReply(validInput);

    expect(result).toEqual({
      success: true,
      message: {
        id: 'm-new',
        role: 'assistant',
        senderType: 'human',
        content: validInput.content,
        createdAt: '2026-01-01T00:00:00Z'
      }
    });
    expect(insertPayload).toEqual({
      conversation_id: CONVERSATION_ID,
      role: 'assistant',
      sender_type: 'human',
      content: validInput.content,
      client_message_id: CLIENT_MESSAGE_ID
    });
  });

  it('reusing the same client_message_id after a dropped response returns the original message instead of creating a duplicate', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(
        chainable({
          data: { id: CONVERSATION_ID, status: 'open', human_takeover: true },
          error: null
        })
      )
      // The insert appears to fail with a unique-constraint violation —
      // in reality the first attempt already succeeded and this is a
      // retry of the same client_message_id.
      .mockReturnValueOnce(
        chainable({ data: null, error: { code: '23505', message: 'duplicate key' } })
      )
      // The lookup-by-client_message_id fallback finds the row the
      // first attempt actually inserted.
      .mockReturnValueOnce(
        chainable({
          data: {
            id: 'm-original',
            role: 'assistant',
            content: validInput.content,
            sender_type: 'human',
            created_at: '2026-01-01T00:00:00Z'
          },
          error: null
        })
      );
    mockVerifiedBusiness(from);

    const result = await sendHumanReply(validInput);

    expect(result).toEqual({
      success: true,
      message: {
        id: 'm-original',
        role: 'assistant',
        senderType: 'human',
        content: validInput.content,
        createdAt: '2026-01-01T00:00:00Z'
      }
    });
    // Exactly one row exists for this client_message_id — the retry
    // never inserted a second one.
    expect(from).toHaveBeenCalledTimes(3);
  });

  it('returns a friendly error instead of a raw database error when the insert fails for a reason other than a duplicate', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(
        chainable({
          data: { id: CONVERSATION_ID, status: 'open', human_takeover: true },
          error: null
        })
      )
      .mockReturnValueOnce(
        chainable({
          data: null,
          error: { code: '42501', message: 'new row violates row-level security policy' }
        })
      );
    mockVerifiedBusiness(from);

    const result = await sendHumanReply(validInput);

    expect(result).toEqual({
      success: false,
      error: 'Something went wrong sending your message. Please try again.'
    });
    expect(JSON.stringify(result)).not.toContain('row-level security');
  });

  it('returns a friendly error instead of a raw database error when the conversation lookup itself fails', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: null, error: { message: 'connection reset' } }));
    mockVerifiedBusiness(from);

    const result = await sendHumanReply(validInput);

    expect(result).toEqual({
      success: false,
      error: 'Something went wrong sending your message. Please try again.'
    });
    expect(JSON.stringify(result)).not.toContain('connection reset');
  });
});
