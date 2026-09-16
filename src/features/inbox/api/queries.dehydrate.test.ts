import { dehydrate, hydrate } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getQueryClient } from '@/lib/query-client';
import { conversationsOptions, inboxKeys } from './queries';
import type { ConversationListItem } from './types';

/**
 * Regression coverage for the "production Inbox shows 0 conversations"
 * investigation. `src/app/dashboard/inbox/page.tsx` builds a server-side
 * QueryClient with `getQueryClient()` (this app's real dehydrate config,
 * see lib/query-client.ts), fetches, dehydrates, and hands that
 * dehydrated state to `HydrationBoundary`, which the client's
 * `QueryClientProvider` hydrates onto a fresh QueryClient. These tests
 * exercise that exact real mechanism end to end (dehydrate() + hydrate(),
 * the same functions HydrationBoundary calls internally) with 5
 * conversations, matching the exact reported business id — proving the
 * server->client hand-off itself preserves all 5, and documenting the
 * specific bug (an unawaited prefetch dehydrating a still-pending query)
 * this file's page.tsx fix corrects.
 */

const fetchConversations = vi.fn<(businessId: string) => Promise<ConversationListItem[]>>();

vi.mock('./service', () => ({
  fetchConversations: (businessId: string) => fetchConversations(businessId),
  fetchConversationMessages: vi.fn(),
  fetchHandoffForConversation: vi.fn(),
  fetchLeadForConversation: vi.fn(),
  reopenConversation: vi.fn(),
  resolveConversation: vi.fn(),
  returnToAIConversation: vi.fn(),
  sendHumanReply: vi.fn(),
  takeOverConversation: vi.fn()
}));

const REPORTED_BUSINESS_ID = 'c35003d0-6956-47d2-9f9b-1fc1dc10090b';

function conversation(id: string): ConversationListItem {
  return {
    id,
    displayName: `Visitor ${id}`,
    hasLeadName: false,
    leadContact: null,
    maskedVisitorId: 'an••••1234',
    channel: 'website',
    detectedLanguage: 'en',
    status: 'open',
    humanTakeover: false,
    handoffStatus: null,
    latestMessagePreview: null,
    latestMessageAt: null,
    updatedAt: '2026-01-01T00:00:00Z'
  };
}

beforeEach(() => {
  fetchConversations.mockReset();
});

describe('Inbox conversations — dehydrate/hydrate survival', () => {
  it('5 conversations fetched server-side reach a fresh client QueryClient with the same query key, unchanged', async () => {
    const conversations = Array.from({ length: 5 }, (_, i) => conversation(`conv-${i + 1}`));
    fetchConversations.mockResolvedValue(conversations);

    // Mirrors page.tsx exactly: await fetchQuery, then dehydrate.
    const serverQueryClient = getQueryClient();
    const fetched = await serverQueryClient.fetchQuery(conversationsOptions(REPORTED_BUSINESS_ID));
    expect(fetched).toHaveLength(5);

    const dehydratedState = dehydrate(serverQueryClient);
    const queryKey = inboxKeys.conversations(REPORTED_BUSINESS_ID);
    const dehydratedQuery = dehydratedState.queries.find(
      (q) => JSON.stringify(q.queryKey) === JSON.stringify(queryKey)
    );
    expect(dehydratedQuery).toBeDefined();
    expect(dehydratedQuery?.state.status).toBe('success');

    // Mirrors HydrationBoundary on the client: a fresh QueryClient
    // hydrated from the server's dehydrated state.
    const clientQueryClient = getQueryClient();
    hydrate(clientQueryClient, dehydratedState);

    const hydratedData = clientQueryClient.getQueryData<ConversationListItem[]>(queryKey);
    expect(hydratedData).toHaveLength(5);
    expect(hydratedData?.map((c) => c.id)).toEqual([
      'conv-1',
      'conv-2',
      'conv-3',
      'conv-4',
      'conv-5'
    ]);
  });

  it('documents the bug the page.tsx fix corrects: an unawaited prefetchQuery is still pending when dehydrate() runs on the same tick', async () => {
    const conversations = Array.from({ length: 5 }, (_, i) => conversation(`conv-${i + 1}`));
    fetchConversations.mockResolvedValue(conversations);

    const serverQueryClient = getQueryClient();
    // Deliberately not awaited — reproduces the previous page.tsx code
    // (`void queryClient.prefetchQuery(...)`).
    void serverQueryClient.prefetchQuery(conversationsOptions(REPORTED_BUSINESS_ID));

    const dehydratedState = dehydrate(serverQueryClient);
    const queryKey = inboxKeys.conversations(REPORTED_BUSINESS_ID);
    const dehydratedQuery = dehydratedState.queries.find(
      (q) => JSON.stringify(q.queryKey) === JSON.stringify(queryKey)
    );

    // Still pending at dehydration time — the queryFn's promise hasn't
    // settled yet on this synchronous tick. Whether a pending-status
    // dehydrated query is actually useful to the client depends on
    // streaming support this app doesn't have wired up, which is exactly
    // why page.tsx now awaits fetchQuery instead.
    expect(dehydratedQuery?.state.status).toBe('pending');
  });

  it('a failed server-side fetch is never mistaken for an empty conversations list at the dehydration boundary', async () => {
    fetchConversations.mockRejectedValue(new Error('db unavailable'));

    const serverQueryClient = getQueryClient();
    await expect(
      serverQueryClient.fetchQuery(conversationsOptions(REPORTED_BUSINESS_ID))
    ).rejects.toThrow('db unavailable');

    const dehydratedState = dehydrate(serverQueryClient);
    const queryKey = inboxKeys.conversations(REPORTED_BUSINESS_ID);
    const dehydratedQuery = dehydratedState.queries.find(
      (q) => JSON.stringify(q.queryKey) === JSON.stringify(queryKey)
    );

    // This app's shouldDehydrateQuery only allows success/pending, so a
    // genuine error is never silently dehydrated as if it were an empty
    // success — page.tsx's own try/catch around fetchQuery (not
    // dehydration) is what must surface this, which is what
    // serverPrefetchError/serverConversationCount in page.tsx do.
    expect(dehydratedQuery).toBeUndefined();

    const clientQueryClient = getQueryClient();
    hydrate(clientQueryClient, dehydratedState);
    expect(clientQueryClient.getQueryData(queryKey)).toBeUndefined();
  });
});
