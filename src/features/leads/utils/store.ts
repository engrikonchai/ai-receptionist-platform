import { create } from 'zustand';

/**
 * Leads UI-only state — which lead (if any) the details sheet is open
 * for. No lead data lives here: that comes from React Query
 * (`../api/queries.ts`), backed by real Supabase reads. Mirrors
 * src/features/knowledge/utils/store.ts / src/features/inbox/utils/store.ts.
 */
type LeadsUiState = {
  selectedLeadId: string | null;
  sheetOpen: boolean;

  openLead: (leadId: string) => void;
  setSheetOpen: (open: boolean) => void;
};

export const useLeadsUiStore = create<LeadsUiState>()((set) => ({
  selectedLeadId: null,
  sheetOpen: false,

  openLead: (leadId) => set({ selectedLeadId: leadId, sheetOpen: true }),
  setSheetOpen: (open) => set({ sheetOpen: open })
}));
