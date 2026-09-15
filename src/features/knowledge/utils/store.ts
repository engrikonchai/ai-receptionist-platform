import { create } from 'zustand';
import type { KnowledgeItem } from '../api/types';

/**
 * Knowledge Base UI-only state — which item (if any) the create/edit
 * sheet and the delete confirmation are open for. No knowledge data
 * lives here: that comes from React Query (`../api/queries.ts`),
 * backed by real Supabase reads. Shared via a store (not props) so the
 * "Add knowledge" button in the page header and each item's Edit/
 * Delete actions in the list can open the same sheet/dialog instance —
 * mirrors src/features/inbox/utils/store.ts.
 */

type KnowledgeUiState = {
  sheetOpen: boolean;
  editingItem: KnowledgeItem | null;
  itemPendingDelete: KnowledgeItem | null;

  openCreateSheet: () => void;
  openEditSheet: (item: KnowledgeItem) => void;
  closeSheet: () => void;
  requestDelete: (item: KnowledgeItem) => void;
  cancelDelete: () => void;
};

export const useKnowledgeUiStore = create<KnowledgeUiState>()((set) => ({
  sheetOpen: false,
  editingItem: null,
  itemPendingDelete: null,

  openCreateSheet: () => set({ sheetOpen: true, editingItem: null }),
  openEditSheet: (item) => set({ sheetOpen: true, editingItem: item }),
  closeSheet: () => set({ sheetOpen: false, editingItem: null }),
  requestDelete: (item) => set({ itemPendingDelete: item }),
  cancelDelete: () => set({ itemPendingDelete: null })
}));
