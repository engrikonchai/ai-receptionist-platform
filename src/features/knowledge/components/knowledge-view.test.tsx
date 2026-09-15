// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KnowledgeItem } from '../api/types';
import { KnowledgeView } from './knowledge-view';

const fetchItems = vi.fn<() => Promise<KnowledgeItem[]>>();

vi.mock('../api/queries', () => ({
  knowledgeItemsOptions: (businessId: string) => ({
    queryKey: ['knowledge', businessId, 'items'],
    queryFn: fetchItems
  }),
  createKnowledgeItemMutation: () => ({ mutationFn: vi.fn() }),
  updateKnowledgeItemMutation: () => ({ mutationFn: vi.fn() }),
  toggleKnowledgeItemMutation: () => ({ mutationFn: vi.fn() }),
  deleteKnowledgeItemMutation: () => ({ mutationFn: vi.fn() })
}));

function item(overrides: Partial<KnowledgeItem> & { id: string }): KnowledgeItem {
  return {
    category: 'General',
    question: 'Question?',
    answerEn: 'Answer',
    answerMe: '',
    answerRu: '',
    isActive: true,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides
  };
}

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <KnowledgeView businessId='biz-1' defaultLanguage='en' supportedLanguages={['en']} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  fetchItems.mockReset();
});

describe('KnowledgeView — loading and error states', () => {
  it('shows a loading skeleton while the query is pending, not the list or an empty state', () => {
    fetchItems.mockReturnValue(new Promise(() => {}));
    renderView();

    expect(screen.queryByRole('list', { name: 'Knowledge items' })).not.toBeInTheDocument();
    expect(screen.queryByText('No knowledge yet')).not.toBeInTheDocument();
  });

  it('shows a friendly error state with a retry button on failure', async () => {
    fetchItems.mockRejectedValue(
      new Error('We could not load the knowledge base. Please try again.')
    );
    renderView();

    expect(
      await screen.findByText('We could not load the knowledge base. Please try again.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });
});

describe('KnowledgeView — empty and no-results states', () => {
  it('shows the empty state when there is no knowledge yet', async () => {
    fetchItems.mockResolvedValue([]);
    renderView();

    expect(await screen.findByText('No knowledge yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add knowledge/ })).toBeInTheDocument();
  });

  it('shows a no-results state when the search excludes every item, offering to clear filters', async () => {
    fetchItems.mockResolvedValue([item({ id: '1', question: 'Check-in time?' })]);
    const user = userEvent.setup();
    renderView();

    await screen.findByText('Check-in time?');
    await user.type(screen.getByLabelText('Search knowledge base'), 'nonexistent search term');

    expect(await screen.findByText('No results')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });
});

describe('KnowledgeView — filters and search', () => {
  it('search matches question text', async () => {
    fetchItems.mockResolvedValue([
      item({ id: '1', question: 'Check-in time?' }),
      item({ id: '2', question: 'Pet policy?' })
    ]);
    const user = userEvent.setup();
    renderView();

    await screen.findByText('Check-in time?');
    await user.type(screen.getByLabelText('Search knowledge base'), 'pet');

    expect(screen.queryByText('Check-in time?')).not.toBeInTheDocument();
    expect(screen.getByText('Pet policy?')).toBeInTheDocument();
  });

  it('search matches answer text too', async () => {
    fetchItems.mockResolvedValue([
      item({ id: '1', question: 'Q1', answerEn: 'Check-in is at 3pm' }),
      item({ id: '2', question: 'Q2', answerEn: 'We allow pets' })
    ]);
    const user = userEvent.setup();
    renderView();

    await screen.findByText('Q1');
    await user.type(screen.getByLabelText('Search knowledge base'), '3pm');

    expect(screen.getByText('Q1')).toBeInTheDocument();
    expect(screen.queryByText('Q2')).not.toBeInTheDocument();
  });

  it('the status filter shows only active or only inactive items', async () => {
    fetchItems.mockResolvedValue([
      item({ id: '1', question: 'Active question', isActive: true }),
      item({ id: '2', question: 'Inactive question', isActive: false })
    ]);
    const user = userEvent.setup();
    renderView();

    await screen.findByText('Active question');
    await user.click(screen.getByRole('button', { name: 'Inactive' }));

    expect(screen.queryByText('Active question')).not.toBeInTheDocument();
    expect(screen.getByText('Inactive question')).toBeInTheDocument();
  });
});

describe('KnowledgeView — counts', () => {
  it('shows total and active item counts', async () => {
    fetchItems.mockResolvedValue([
      item({ id: '1', isActive: true }),
      item({ id: '2', isActive: true }),
      item({ id: '3', isActive: false })
    ]);
    renderView();

    await waitFor(() =>
      expect(screen.getByText('Total items').nextElementSibling).toHaveTextContent('3')
    );
    expect(screen.getByText('Active items').nextElementSibling).toHaveTextContent('2');
  });
});
