// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KnowledgeActionResult, KnowledgeItem } from '../api/types';
import { useKnowledgeUiStore } from '../utils/store';
import { DeleteKnowledgeDialog } from './delete-knowledge-dialog';

const deleteMutationFn = vi.fn<(itemId: string) => Promise<KnowledgeActionResult>>();

vi.mock('../api/queries', () => ({
  deleteKnowledgeItemMutation: () => ({ mutationFn: deleteMutationFn })
}));

const item: KnowledgeItem = {
  id: 'item-1',
  category: 'Check-in',
  question: 'What time is check-in?',
  answerEn: 'Check-in is at 3pm.',
  answerMe: '',
  answerRu: '',
  isActive: true,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z'
};

function renderDialog() {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <DeleteKnowledgeDialog businessId='biz-1' />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  deleteMutationFn.mockReset();
  useKnowledgeUiStore.setState({ sheetOpen: false, editingItem: null, itemPendingDelete: null });
});

describe('DeleteKnowledgeDialog', () => {
  it('is not shown until a delete is requested', () => {
    renderDialog();
    expect(screen.queryByText('Delete this knowledge item?')).not.toBeInTheDocument();
  });

  it('requires confirmation — deleting only happens after the Delete button is clicked, never automatically', async () => {
    useKnowledgeUiStore.getState().requestDelete(item);
    renderDialog();

    expect(screen.getByText('Delete this knowledge item?')).toBeInTheDocument();
    expect(
      screen.getByText(/removes that information from future chatbot answers/)
    ).toBeInTheDocument();
    expect(deleteMutationFn).not.toHaveBeenCalled();
  });

  it('cancelling closes the dialog without deleting', async () => {
    useKnowledgeUiStore.getState().requestDelete(item);
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(deleteMutationFn).not.toHaveBeenCalled();
    await waitFor(() => expect(useKnowledgeUiStore.getState().itemPendingDelete).toBeNull());
  });

  it('disables Cancel and Delete while the delete is in flight', async () => {
    let resolveDelete!: (value: KnowledgeActionResult) => void;
    deleteMutationFn.mockReturnValue(
      new Promise((resolve) => {
        resolveDelete = resolve;
      })
    );
    useKnowledgeUiStore.getState().requestDelete(item);
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();

    resolveDelete({ success: true });
  });

  it('deletes successfully and closes the dialog', async () => {
    deleteMutationFn.mockResolvedValue({ success: true });
    useKnowledgeUiStore.getState().requestDelete(item);
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleteMutationFn).toHaveBeenCalledTimes(1));
    expect(deleteMutationFn.mock.calls[0]?.[0]).toBe('item-1');
    await waitFor(() => expect(useKnowledgeUiStore.getState().itemPendingDelete).toBeNull());
  });

  it('keeps the dialog open and surfaces the error when the delete fails', async () => {
    deleteMutationFn.mockResolvedValue({
      success: false,
      error: 'This knowledge item is no longer available.'
    });
    useKnowledgeUiStore.getState().requestDelete(item);
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleteMutationFn).toHaveBeenCalledTimes(1));
    expect(useKnowledgeUiStore.getState().itemPendingDelete).toEqual(item);
  });
});
