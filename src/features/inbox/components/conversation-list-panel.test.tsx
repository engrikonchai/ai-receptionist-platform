// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationListItem } from '../api/types';
import { useInboxStore } from '../utils/store';
import { ConversationListPanel } from './conversation-list-panel';

const fetchItems = vi.fn<() => Promise<ConversationListItem[]>>();

vi.mock('../api/queries', () => ({
  conversationsOptions: (businessId: string) => ({
    queryKey: ['inbox', businessId, 'conversations'],
    queryFn: fetchItems
  })
}));

const REPORTED_BUSINESS_ID = 'c35003d0-6956-47d2-9f9b-1fc1dc10090b';

function conversation(
  overrides: Partial<ConversationListItem> & { id: string }
): ConversationListItem {
  return {
    displayName: `Visitor ${overrides.id}`,
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
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides
  };
}

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ConversationListPanel businessId={REPORTED_BUSINESS_ID} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  fetchItems.mockReset();
  // useInboxStore is a module-level singleton (see utils/store.ts) — a
  // stale status/channel filter left over from a previous test would
  // otherwise make "all 5 render" fail for a reason unrelated to what's
  // under test here.
  useInboxStore.setState({
    selectedConversationId: null,
    searchQuery: '',
    statusFilter: 'all',
    channelFilters: [],
    customerPanelCollapsed: false,
    mobileView: 'list',
    customerSheetOpen: false
  });
});

describe('ConversationListPanel', () => {
  it('renders all 5 conversations under the default "All" status filter with no channel filters and no search', async () => {
    const conversations = Array.from({ length: 5 }, (_, i) =>
      conversation({ id: `conv-${i + 1}` })
    );
    fetchItems.mockResolvedValue(conversations);

    renderPanel();

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(5));
    expect(screen.getByText('5 conversations')).toBeInTheDocument();
    expect(screen.queryByText('No conversations yet')).not.toBeInTheDocument();
  });

  it('the "All" status filter button is the one pressed by default', async () => {
    fetchItems.mockResolvedValue([conversation({ id: 'conv-1' })]);
    renderPanel();

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the empty state when there are no conversations', async () => {
    fetchItems.mockResolvedValue([]);
    renderPanel();

    await waitFor(() => expect(screen.getByText('No conversations yet')).toBeInTheDocument());
  });
});
