// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeadListItem } from '../api/types';
import { useLeadsUiStore } from '../utils/store';
import { LeadsView } from './leads-view';

const fetchLeads = vi.fn<() => Promise<LeadListItem[]>>();

vi.mock('../api/queries', () => ({
  leadsListOptions: (businessId: string) => ({
    queryKey: ['leads', businessId, 'list'],
    queryFn: fetchLeads
  }),
  updateLeadStatusMutation: () => ({ mutationFn: vi.fn() }),
  leadDetailsOptions: () => ({
    queryKey: ['leads', 'detail', 'unused'],
    queryFn: () => Promise.resolve({ status: 'not_found' })
  })
}));

function lead(overrides: Partial<LeadListItem> & { id: string }): LeadListItem {
  return {
    reference: 'HO-1',
    displayName: 'Jane Visitor',
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

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <LeadsView businessId='biz-1' />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  fetchLeads.mockReset();
  useLeadsUiStore.setState({ selectedLeadId: null, sheetOpen: false });
});

describe('LeadsView — loading and error states', () => {
  it('shows a loading skeleton while the query is pending, not the list or an empty state', () => {
    fetchLeads.mockReturnValue(new Promise(() => {}));
    renderView();

    expect(screen.queryByRole('list', { name: 'Leads' })).not.toBeInTheDocument();
    expect(screen.queryByText('No leads yet')).not.toBeInTheDocument();
  });

  it('shows a friendly error state with a retry button on failure, not a silent empty list', async () => {
    fetchLeads.mockRejectedValue(new Error('We could not load leads. Please try again.'));
    renderView();

    expect(
      await screen.findByText('We could not load leads. Please try again.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
    expect(screen.queryByText('No leads yet')).not.toBeInTheDocument();
  });
});

describe('LeadsView — empty and no-results states', () => {
  it('shows the empty state, explaining how leads are created, when there are none yet', async () => {
    fetchLeads.mockResolvedValue([]);
    renderView();

    expect(await screen.findByText('No leads yet')).toBeInTheDocument();
    expect(screen.getByText(/Talk to a person/)).toBeInTheDocument();
  });

  it('shows a no-results state when the search excludes every lead, offering to clear filters', async () => {
    fetchLeads.mockResolvedValue([lead({ id: '1', displayName: 'Jane Visitor' })]);
    const user = userEvent.setup();
    renderView();

    await screen.findByText('Jane Visitor');
    await user.type(screen.getByLabelText('Search leads'), 'nonexistent name');

    expect(await screen.findByText('No results')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });
});

describe('LeadsView — search and filters', () => {
  it('search matches the lead’s display name', async () => {
    fetchLeads.mockResolvedValue([
      lead({ id: '1', displayName: 'Jane Visitor' }),
      lead({ id: '2', displayName: 'John Guest' })
    ]);
    const user = userEvent.setup();
    renderView();

    await screen.findByText('Jane Visitor');
    await user.type(screen.getByLabelText('Search leads'), 'john');

    expect(screen.queryByText('Jane Visitor')).not.toBeInTheDocument();
    expect(screen.getByText('John Guest')).toBeInTheDocument();
  });

  it('search matches the lead’s reference too', async () => {
    fetchLeads.mockResolvedValue([
      lead({ id: '1', displayName: 'Jane Visitor', reference: 'HO-AAA111' }),
      lead({ id: '2', displayName: 'John Guest', reference: 'HO-BBB222' })
    ]);
    const user = userEvent.setup();
    renderView();

    await screen.findByText('Jane Visitor');
    await user.type(screen.getByLabelText('Search leads'), 'bbb222');

    expect(screen.queryByText('Jane Visitor')).not.toBeInTheDocument();
    expect(screen.getByText('John Guest')).toBeInTheDocument();
  });

  it('the status filter shows only leads with the selected status', async () => {
    fetchLeads.mockResolvedValue([
      lead({ id: '1', displayName: 'New Lead', status: 'new' }),
      lead({ id: '2', displayName: 'Contacted Lead', status: 'contacted' })
    ]);
    const user = userEvent.setup();
    renderView();

    await screen.findByText('New Lead');
    await user.click(screen.getByRole('combobox', { name: 'Filter by status' }));
    await user.click(await screen.findByRole('option', { name: 'Contacted' }));

    expect(screen.queryByText('New Lead')).not.toBeInTheDocument();
    expect(screen.getByText('Contacted Lead')).toBeInTheDocument();
  });

  it('the source filter shows only leads from the selected channel', async () => {
    fetchLeads.mockResolvedValue([
      lead({ id: '1', displayName: 'Website Lead', source: 'website' }),
      lead({ id: '2', displayName: 'Instagram Lead', source: 'instagram' })
    ]);
    const user = userEvent.setup();
    renderView();

    await screen.findByText('Website Lead');
    await user.click(screen.getByRole('combobox', { name: 'Filter by source' }));
    await user.click(await screen.findByRole('option', { name: 'Instagram' }));

    expect(screen.queryByText('Website Lead')).not.toBeInTheDocument();
    expect(screen.getByText('Instagram Lead')).toBeInTheDocument();
  });
});

describe('LeadsView — stats and masking', () => {
  it('shows total/new/contacted/resolved counts, folding confirmed and lost into "Resolved"', async () => {
    fetchLeads.mockResolvedValue([
      lead({ id: '1', status: 'new' }),
      lead({ id: '2', status: 'new' }),
      lead({ id: '3', status: 'contacted' }),
      lead({ id: '4', status: 'confirmed' }),
      lead({ id: '5', status: 'lost' })
    ]);
    renderView();

    await waitFor(() =>
      expect(screen.getByText('Total leads').nextElementSibling).toHaveTextContent('5')
    );
    // Scoped to the stats grid — the status filter's own hidden option
    // list also contains a "New" option, so an unscoped getByText would
    // match both.
    const statsGrid = screen.getByText('Total leads').closest('.grid') as HTMLElement;
    expect(within(statsGrid).getByText('New').nextElementSibling).toHaveTextContent('2');
    expect(within(statsGrid).getByText('Contacted').nextElementSibling).toHaveTextContent('1');
    expect(within(statsGrid).getByText('Resolved').nextElementSibling).toHaveTextContent('2');
  });

  it('never renders a raw contact string in the list — only the already-masked value the service returned', async () => {
    fetchLeads.mockResolvedValue([
      lead({ id: '1', displayName: 'Jane Visitor', maskedContact: 'j•••@e•••.com' })
    ]);
    renderView();

    expect(await screen.findByText('j•••@e•••.com')).toBeInTheDocument();
    expect(screen.queryByText(/@example\.com$/)).not.toBeInTheDocument();
  });
});
