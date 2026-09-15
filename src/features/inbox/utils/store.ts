import { create } from 'zustand';
import type { ConversationChannel } from '@/lib/supabase/database.types';
import type { InboxStatusFilter } from '../api/types';

/**
 * Inbox UI-only state — selection, filters, panel/sheet open state. No
 * conversation, message, lead or handoff data lives here: that all comes
 * from React Query (`../api/queries.ts`), backed by real Supabase reads,
 * and is never cached only in browser memory.
 */

type MobileView = 'list' | 'thread';

type InboxUiState = {
  selectedConversationId: string | null;
  searchQuery: string;
  statusFilter: InboxStatusFilter;
  channelFilters: ConversationChannel[];
  customerPanelCollapsed: boolean;
  mobileView: MobileView;
  customerSheetOpen: boolean;

  /** Sets the active conversation without changing mobile navigation — used for auto-selecting the first conversation on load. */
  selectConversation: (id: string) => void;
  /** Sets the active conversation and, on mobile, navigates to the thread — used when a user taps a conversation row. */
  openConversation: (id: string) => void;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (filter: InboxStatusFilter) => void;
  toggleChannelFilter: (channel: ConversationChannel) => void;
  setCustomerPanelCollapsed: (collapsed: boolean) => void;
  setMobileView: (view: MobileView) => void;
  setCustomerSheetOpen: (open: boolean) => void;
};

export const useInboxStore = create<InboxUiState>()((set) => ({
  selectedConversationId: null,
  searchQuery: '',
  statusFilter: 'all',
  channelFilters: [],
  customerPanelCollapsed: false,
  mobileView: 'list',
  customerSheetOpen: false,

  selectConversation: (id) => set({ selectedConversationId: id }),

  openConversation: (id) => set({ selectedConversationId: id, mobileView: 'thread' }),

  setSearchQuery: (query) => set({ searchQuery: query }),
  setStatusFilter: (filter) => set({ statusFilter: filter }),

  toggleChannelFilter: (channel) =>
    set((state) => ({
      channelFilters: state.channelFilters.includes(channel)
        ? state.channelFilters.filter((c) => c !== channel)
        : [...state.channelFilters, channel]
    })),

  setCustomerPanelCollapsed: (collapsed) => set({ customerPanelCollapsed: collapsed }),
  setMobileView: (view) => set({ mobileView: view }),
  setCustomerSheetOpen: (open) => set({ customerSheetOpen: open })
}));
