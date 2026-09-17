// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationListItem } from '@/features/inbox/api/types';
import type { LeadListItem } from '@/features/leads/api/types';
import { useNavBadgeCounts } from './use-nav-badge-counts';

const fetchConversations = vi.fn<() => Promise<ConversationListItem[]>>();
const fetchLeads = vi.fn<() => Promise<LeadListItem[]>>();

vi.mock('@/features/inbox/api/queries', () => ({
  conversationsOptions: (businessId: string) => ({
    queryKey: ['inbox', businessId, 'conversations'],
    queryFn: fetchConversations
  })
}));

vi.mock('@/features/leads/api/queries', () => ({
  leadsListOptions: (businessId: string) => ({
    queryKey: ['leads', businessId, 'list'],
    queryFn: fetchLeads
  })
}));

function conversation(
  overrides: Partial<ConversationListItem> & { id: string }
): ConversationListItem {
  return {
    displayName: 'Visitor',
    hasLeadName: false,
    leadContact: null,
    maskedVisitorId: 'vi••••01',
    channel: 'website',
    detectedLanguage: 'en',
    status: 'open',
    humanTakeover: false,
    handoffStatus: null,
    latestMessagePreview: null,
    latestMessageAt: null,
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides
  };
}

function lead(overrides: Partial<LeadListItem> & { id: string }): LeadListItem {
  return {
    reference: 'HO-1',
    displayName: 'Jane',
    maskedContact: 'j•••@e•••.com',
    status: 'new',
    source: 'website',
    conversationId: null,
    handoffStatus: null,
    humanTakeover: false,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides
  };
}

function renderUseNavBadgeCounts(businessId: string | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useNavBadgeCounts(businessId), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  });
}

beforeEach(() => {
  fetchConversations.mockReset();
  fetchLeads.mockReset();
});

describe('useNavBadgeCounts', () => {
  it('returns zero counts and queries nothing when there is no active business yet', () => {
    const { result } = renderUseNavBadgeCounts(null);

    expect(result.current).toEqual({ pendingHandoffCount: 0, newLeadCount: 0 });
    expect(fetchConversations).not.toHaveBeenCalled();
    expect(fetchLeads).not.toHaveBeenCalled();
  });

  it('counts only conversations whose handoff is still "new" (requested, waiting for owner) as pending', async () => {
    fetchConversations.mockResolvedValue([
      conversation({ id: 'c1', handoffStatus: 'new' }),
      conversation({ id: 'c2', handoffStatus: 'contacted', humanTakeover: true }),
      conversation({ id: 'c3', handoffStatus: 'resolved' }),
      conversation({ id: 'c4', handoffStatus: null }),
      conversation({ id: 'c5', handoffStatus: 'new' })
    ]);
    fetchLeads.mockResolvedValue([]);

    const { result } = renderUseNavBadgeCounts('biz-1');

    await waitFor(() => expect(result.current.pendingHandoffCount).toBe(2));
  });

  it('counts only leads with status "new" toward the Leads badge', async () => {
    fetchConversations.mockResolvedValue([]);
    fetchLeads.mockResolvedValue([
      lead({ id: 'l1', status: 'new' }),
      lead({ id: 'l2', status: 'contacted' }),
      lead({ id: 'l3', status: 'confirmed' }),
      lead({ id: 'l4', status: 'lost' }),
      lead({ id: 'l5', status: 'new' }),
      lead({ id: 'l6', status: 'new' })
    ]);

    const { result } = renderUseNavBadgeCounts('biz-1');

    await waitFor(() => expect(result.current.newLeadCount).toBe(3));
  });
});
