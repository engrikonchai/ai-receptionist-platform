import { create } from 'zustand';
import { initialConversations } from './data';
import { nowTimestamp } from './format';
import type { Channel, Conversation, Message, StatusFilter } from './types';

const CURRENT_OPERATOR = 'Demo Owner';

type MobileView = 'list' | 'thread';

type InboxState = {
  conversations: Conversation[];
  selectedConversationId: string;
  draft: string;
  searchQuery: string;
  statusFilter: StatusFilter;
  channelFilters: Channel[];
  customerPanelCollapsed: boolean;
  mobileView: MobileView;
  customerSheetOpen: boolean;

  selectConversation: (id: string) => void;
  setDraft: (text: string) => void;
  sendMessage: () => void;
  insertSuggestedReply: (text: string) => void;
  takeOver: (id: string) => void;
  returnToAI: (id: string) => void;
  addNote: (id: string, text: string) => void;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (filter: StatusFilter) => void;
  toggleChannelFilter: (channel: Channel) => void;
  setCustomerPanelCollapsed: (collapsed: boolean) => void;
  setMobileView: (view: MobileView) => void;
  setCustomerSheetOpen: (open: boolean) => void;
  getActiveConversation: () => Conversation | undefined;
};

export const useInboxStore = create<InboxState>()((set, get) => ({
  conversations: initialConversations,
  selectedConversationId: initialConversations[0]?.id ?? '',
  draft: '',
  searchQuery: '',
  statusFilter: 'all',
  channelFilters: [],
  customerPanelCollapsed: false,
  mobileView: 'list',
  customerSheetOpen: false,

  selectConversation: (id) =>
    set((state) => ({
      selectedConversationId: id,
      mobileView: 'thread',
      draft: '',
      conversations: state.conversations.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c))
    })),

  setDraft: (text) => set({ draft: text }),

  sendMessage: () => {
    const state = get();
    const text = state.draft.trim();
    if (!text) return;
    const active = state.conversations.find((c) => c.id === state.selectedConversationId);
    if (!active) return;

    const outgoing: Message = {
      id: `${active.id}-out-${Date.now()}`,
      sender: active.handledBy === 'human' ? 'human' : 'ai',
      author: active.handledBy === 'human' ? CURRENT_OPERATOR : 'AI Receptionist',
      text,
      timestamp: nowTimestamp()
    };

    set({
      draft: '',
      conversations: state.conversations.map((c) =>
        c.id === active.id ? { ...c, messages: [...c.messages, outgoing] } : c
      )
    });
  },

  insertSuggestedReply: (text) => set({ draft: text }),

  takeOver: (id) =>
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== id || c.handledBy === 'human') return c;
        const event: Message = {
          id: `${id}-event-${Date.now()}`,
          sender: 'system',
          author: 'System',
          text: `${CURRENT_OPERATOR} took over this conversation from AI Receptionist.`,
          timestamp: nowTimestamp()
        };
        return { ...c, handledBy: 'human', messages: [...c.messages, event] };
      })
    })),

  returnToAI: (id) =>
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== id || c.handledBy === 'ai') return c;
        const event: Message = {
          id: `${id}-event-${Date.now()}`,
          sender: 'system',
          author: 'System',
          text: `${CURRENT_OPERATOR} returned this conversation to AI Receptionist.`,
          timestamp: nowTimestamp()
        };
        return { ...c, handledBy: 'ai', messages: [...c.messages, event] };
      })
    })),

  addNote: (id, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== id) return c;
        return {
          ...c,
          customer: {
            ...c.customer,
            notes: [
              ...c.customer.notes,
              {
                id: `${id}-note-${Date.now()}`,
                author: CURRENT_OPERATOR,
                text: trimmed,
                timestamp: nowTimestamp()
              }
            ]
          }
        };
      })
    }));
  },

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
  setCustomerSheetOpen: (open) => set({ customerSheetOpen: open }),

  getActiveConversation: () => {
    const state = get();
    return state.conversations.find((c) => c.id === state.selectedConversationId);
  }
}));

export { CURRENT_OPERATOR };
