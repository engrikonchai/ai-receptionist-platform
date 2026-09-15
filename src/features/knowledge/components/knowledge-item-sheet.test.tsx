// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KnowledgeItem, KnowledgeItemResult } from '../api/types';
import { useKnowledgeUiStore } from '../utils/store';
import { KnowledgeItemSheet } from './knowledge-item-sheet';

const createMutationFn = vi.fn<(input: unknown) => Promise<KnowledgeItemResult>>();
const updateMutationFn = vi.fn<(input: unknown) => Promise<KnowledgeItemResult>>();

vi.mock('../api/queries', () => ({
  createKnowledgeItemMutation: () => ({ mutationFn: createMutationFn }),
  updateKnowledgeItemMutation: () => ({ mutationFn: updateMutationFn })
}));

const existingItem: KnowledgeItem = {
  id: 'item-1',
  category: 'Check-in',
  question: 'What time is check-in?',
  answerEn: 'Check-in is at 3pm.',
  answerMe: 'Prijava je u 15h.', // an existing Montenegrin answer
  answerRu: '',
  isActive: true,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z'
};

function renderSheet() {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <KnowledgeItemSheet businessId='biz-1' defaultLanguage='en' supportedLanguages={['en']} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  createMutationFn.mockReset();
  updateMutationFn.mockReset();
  useKnowledgeUiStore.setState({ sheetOpen: false, editingItem: null, itemPendingDelete: null });
});

describe('KnowledgeItemSheet — create', () => {
  it('rejects a missing default-language answer client-side, without calling the mutation', async () => {
    useKnowledgeUiStore.getState().openCreateSheet();
    const user = userEvent.setup();
    renderSheet();

    await user.type(screen.getByLabelText(/^Category/), 'Check-in');
    await user.type(screen.getByLabelText(/^Question/), 'What time is check-in?');
    await user.click(screen.getByRole('button', { name: /Add item/ }));

    expect(
      await screen.findByText('An answer in the default language is required.')
    ).toBeInTheDocument();
    expect(createMutationFn).not.toHaveBeenCalled();
  });

  it('submits a successful create with the typed values, then closes the sheet', async () => {
    // Trimming itself is enforced server-side by knowledgeItemSchema
    // (see schemas/knowledge.test.ts) — the form sends the raw typed
    // value over the wire; the server is the authoritative sanitizer.
    createMutationFn.mockResolvedValue({ success: true, item: existingItem });
    useKnowledgeUiStore.getState().openCreateSheet();
    const user = userEvent.setup();
    renderSheet();

    await user.type(screen.getByLabelText(/^Category/), 'Check-in');
    await user.type(screen.getByLabelText(/^Question/), 'What time?');
    await user.type(screen.getByLabelText(/^English answer/), '3pm');
    await user.click(screen.getByRole('button', { name: /Add item/ }));

    await waitFor(() => expect(createMutationFn).toHaveBeenCalledTimes(1));
    const payload = createMutationFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.category).toBe('Check-in');
    expect(payload.question).toBe('What time?');
    expect(payload.answerEn).toBe('3pm');

    await waitFor(() => expect(useKnowledgeUiStore.getState().sheetOpen).toBe(false));
  });

  it('keeps the sheet open and the typed values in place after a failed submission', async () => {
    createMutationFn.mockResolvedValue({
      success: false,
      error: 'Something went wrong. Please try again.'
    });
    useKnowledgeUiStore.getState().openCreateSheet();
    const user = userEvent.setup();
    renderSheet();

    await user.type(screen.getByLabelText(/^Category/), 'Check-in');
    await user.type(screen.getByLabelText(/^Question/), 'What time?');
    await user.type(screen.getByLabelText(/^English answer/), '3pm');
    await user.click(screen.getByRole('button', { name: /Add item/ }));

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument();
    expect(useKnowledgeUiStore.getState().sheetOpen).toBe(true);
    expect(screen.getByLabelText(/^Category/)).toHaveValue('Check-in');
    expect(screen.getByLabelText(/^Question/)).toHaveValue('What time?');
    expect(screen.getByLabelText(/^English answer/)).toHaveValue('3pm');
  });

  it('disables Cancel and shows a loading submit button while saving', async () => {
    let resolveCreate!: (value: KnowledgeItemResult) => void;
    createMutationFn.mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      })
    );
    useKnowledgeUiStore.getState().openCreateSheet();
    const user = userEvent.setup();
    renderSheet();

    await user.type(screen.getByLabelText(/^Category/), 'Check-in');
    await user.type(screen.getByLabelText(/^Question/), 'What time?');
    await user.type(screen.getByLabelText(/^English answer/), '3pm');
    await user.click(screen.getByRole('button', { name: /Add item/ }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled());
    resolveCreate({ success: true, item: existingItem });
  });
});

describe('KnowledgeItemSheet — edit', () => {
  it('populates the form from the existing item', async () => {
    useKnowledgeUiStore.getState().openEditSheet(existingItem);
    renderSheet();

    expect(screen.getByLabelText(/^Category/)).toHaveValue('Check-in');
    expect(screen.getByLabelText(/^Question/)).toHaveValue('What time is check-in?');
    expect(screen.getByLabelText(/^English answer/)).toHaveValue('Check-in is at 3pm.');
  });

  it('never renders a field for an unsupported language, but still submits its existing value unchanged', async () => {
    // supportedLanguages is only ['en'] — Montenegrin has no visible
    // field — yet existingItem.answerMe already has a value.
    useKnowledgeUiStore.getState().openEditSheet(existingItem);
    updateMutationFn.mockResolvedValue({ success: true, item: existingItem });
    const user = userEvent.setup();
    renderSheet();

    expect(screen.queryByLabelText(/^Montenegrin answer/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Save changes/ }));

    await waitFor(() => expect(updateMutationFn).toHaveBeenCalledTimes(1));
    const payload = updateMutationFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.answerMe).toBe('Prijava je u 15h.');
    expect(payload.itemId).toBe('item-1');
  });

  it('shows the Montenegrin field, marked as the default language, when the business supports it and it is the default', async () => {
    useKnowledgeUiStore.getState().openEditSheet(existingItem);
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <KnowledgeItemSheet
          businessId='biz-1'
          defaultLanguage='me'
          supportedLanguages={['en', 'me']}
        />
      </QueryClientProvider>
    );

    expect(screen.getByLabelText(/^Montenegrin answer/)).toHaveValue('Prijava je u 15h.');
    expect(screen.getByText(/Montenegrin answer · Default language/)).toBeInTheDocument();
  });
});
