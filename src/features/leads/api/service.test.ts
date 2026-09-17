import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { verifyActiveBusiness } from './authorize';
import { SESSION_EXPIRED_MESSAGE } from './types';
import { fetchLeadDetails, fetchLeads, updateLeadStatus } from './service';

vi.mock('./authorize', () => ({
  verifyActiveBusiness: vi.fn()
}));

/**
 * A stand-in for Supabase's PostgREST query builder — see the identical
 * helper (and its rationale) in src/features/inbox/api/service.test.ts
 * and src/features/knowledge/api/service.test.ts.
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

function mockVerifiedBusiness(from: ReturnType<typeof vi.fn>, businessId = VERIFIED_BUSINESS_ID) {
  vi.mocked(verifyActiveBusiness).mockResolvedValue({
    ok: true,
    ctx: { supabase: { from } as unknown as SupabaseClient, user: stubUser, businessId }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchLeads', () => {
  it('propagates the authorization failure instead of querying anything', async () => {
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: false,
      error: SESSION_EXPIRED_MESSAGE
    });

    await expect(fetchLeads('biz-1')).rejects.toThrow(SESSION_EXPIRED_MESSAGE);
  });

  it('returns an empty list without querying handoffs or conversations when there are no leads', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: [], error: null }));
    mockVerifiedBusiness(from);

    const result = await fetchLeads('biz-1');

    expect(result).toEqual([]);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('never returns the raw contact string — only a masked value', async () => {
    const leadRow = {
      id: 'lead-1',
      conversation_id: null,
      reference: 'HO-ABC123',
      name: 'Jane Visitor',
      contact: 'jane@example.com',
      source: 'website',
      status: 'new',
      created_at: '2026-01-01T00:00:00.000Z'
    };
    const from = vi.fn().mockReturnValueOnce(chainable({ data: [leadRow], error: null }));
    mockVerifiedBusiness(from);

    const [result] = await fetchLeads('biz-1');

    expect(result.maskedContact).not.toContain('jane@example.com');
    expect(result.maskedContact).toBe('j•••@e•••.com');
    // Only the masked field exists on the list item — nothing on this
    // type carries the raw contact string at all.
    expect(result).not.toHaveProperty('contact');
  });

  it('never queries handoffs or conversations for a lead with no originating conversation', async () => {
    const leadRow = {
      id: 'lead-1',
      conversation_id: null,
      reference: 'HO-ABC123',
      name: 'Jane Visitor',
      contact: 'jane@example.com',
      source: 'website',
      status: 'new',
      created_at: '2026-01-01T00:00:00.000Z'
    };
    const from = vi.fn().mockReturnValueOnce(chainable({ data: [leadRow], error: null }));
    mockVerifiedBusiness(from);

    const [result] = await fetchLeads('biz-1');

    expect(result.handoffStatus).toBeNull();
    expect(result.humanTakeover).toBe(false);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('enriches a lead with its originating conversation’s current handoff status and human_takeover flag', async () => {
    const leadRow = {
      id: 'lead-1',
      conversation_id: 'conv-1',
      reference: 'HO-ABC123',
      name: 'Jane Visitor',
      contact: 'jane@example.com',
      source: 'website',
      status: 'new',
      created_at: '2026-01-01T00:00:00.000Z'
    };
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: [leadRow], error: null })) // leads
      .mockReturnValueOnce(
        chainable({ data: [{ conversation_id: 'conv-1', status: 'contacted' }] })
      ) // handoffs
      .mockReturnValueOnce(chainable({ data: [{ id: 'conv-1', human_takeover: true }] })); // conversations
    mockVerifiedBusiness(from);

    const [result] = await fetchLeads('biz-1');

    expect(result.handoffStatus).toBe('contacted');
    expect(result.humanTakeover).toBe(true);
  });
});

describe('fetchLeadDetails', () => {
  it('propagates the authorization failure instead of querying anything', async () => {
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: false,
      error: SESSION_EXPIRED_MESSAGE
    });

    await expect(fetchLeadDetails('biz-1', 'lead-1')).rejects.toThrow(SESSION_EXPIRED_MESSAGE);
  });

  it('reports the lead as not found instead of leaking data when it belongs to another business', async () => {
    // `.eq('business_id', verifiedId).eq('id', leadId)` matches nothing
    // for a cross-business id — the same guard shape as
    // fetchConversationMessages() in src/features/inbox/api/service.ts.
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null, error: null }));
    mockVerifiedBusiness(from);

    const result = await fetchLeadDetails('biz-1', 'lead-from-another-business');

    expect(result).toEqual({ status: 'not_found' });
  });

  it('returns the full, unmasked contact for the authenticated detail view', async () => {
    const leadRow = {
      id: 'lead-1',
      conversation_id: null,
      reference: 'HO-ABC123',
      name: 'Jane Visitor',
      contact: 'jane@example.com',
      check_in: null,
      check_out: null,
      guest_count: 2,
      note: 'Please call after 5pm',
      language: 'en',
      source: 'website',
      status: 'new',
      created_at: '2026-01-01T00:00:00.000Z'
    };
    const from = vi.fn().mockReturnValueOnce(chainable({ data: leadRow, error: null }));
    mockVerifiedBusiness(from);

    const result = await fetchLeadDetails('biz-1', 'lead-1');

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.lead.contact).toBe('jane@example.com');
      expect(result.lead.note).toBe('Please call after 5pm');
    }
  });

  it('enriches the detail view with the originating conversation’s handoff status', async () => {
    const leadRow = {
      id: 'lead-1',
      conversation_id: 'conv-1',
      reference: 'HO-ABC123',
      name: 'Jane Visitor',
      contact: 'jane@example.com',
      check_in: null,
      check_out: null,
      guest_count: null,
      note: null,
      language: 'en',
      source: 'website',
      status: 'new',
      created_at: '2026-01-01T00:00:00.000Z'
    };
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: leadRow, error: null })) // leads
      .mockReturnValueOnce(chainable({ data: { status: 'resolved' } })) // handoffs
      .mockReturnValueOnce(chainable({ data: { human_takeover: false } })); // conversations
    mockVerifiedBusiness(from);

    const result = await fetchLeadDetails('biz-1', 'lead-1');

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.lead.handoffStatus).toBe('resolved');
      expect(result.lead.humanTakeover).toBe(false);
    }
  });
});

describe('updateLeadStatus', () => {
  it('returns a failure result — not a throw — when authorization fails', async () => {
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: false,
      error: SESSION_EXPIRED_MESSAGE
    });

    await expect(updateLeadStatus('biz-1', 'lead-1', 'contacted')).resolves.toEqual({
      success: false,
      error: SESSION_EXPIRED_MESSAGE
    });
  });

  it('fails safely instead of silently succeeding for a lead belonging to another business', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null, error: null }));
    mockVerifiedBusiness(from);

    const result = await updateLeadStatus('biz-1', 'lead-from-another-business', 'contacted');

    expect(result).toEqual({ success: false, error: 'This lead is no longer available.' });
  });

  it('reports a generic failure when the update itself errors', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: null, error: { message: 'db down' } }));
    mockVerifiedBusiness(from);

    const result = await updateLeadStatus('biz-1', 'lead-1', 'confirmed');

    expect(result).toEqual({ success: false, error: 'Something went wrong. Please try again.' });
  });

  it('succeeds when the update matches the lead', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: { id: 'lead-1' }, error: null }));
    mockVerifiedBusiness(from);

    await expect(updateLeadStatus('biz-1', 'lead-1', 'lost')).resolves.toEqual({ success: true });
  });
});
