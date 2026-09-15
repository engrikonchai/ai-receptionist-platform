'use client';

import { mutationOptions, queryOptions } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import {
  fetchConversationMessages,
  fetchConversations,
  fetchHandoffForConversation,
  fetchLeadForConversation,
  reopenConversation,
  resolveConversation,
  returnToAIConversation,
  takeOverConversation
} from './service';
import type { ConversationActionResult } from './types';

export const inboxKeys = {
  conversations: (businessId: string) => ['inbox', businessId, 'conversations'] as const,
  messages: (businessId: string, conversationId: string) =>
    ['inbox', businessId, 'conversations', conversationId, 'messages'] as const,
  lead: (businessId: string, conversationId: string) =>
    ['inbox', businessId, 'conversations', conversationId, 'lead'] as const,
  handoff: (businessId: string, conversationId: string) =>
    ['inbox', businessId, 'conversations', conversationId, 'handoff'] as const
};

export function conversationsOptions(businessId: string) {
  return queryOptions({
    queryKey: inboxKeys.conversations(businessId),
    queryFn: () => fetchConversations(businessId)
  });
}

export function conversationMessagesOptions(businessId: string, conversationId: string) {
  return queryOptions({
    queryKey: inboxKeys.messages(businessId, conversationId),
    queryFn: () => fetchConversationMessages(businessId, conversationId)
  });
}

export function conversationLeadOptions(businessId: string, conversationId: string) {
  return queryOptions({
    queryKey: inboxKeys.lead(businessId, conversationId),
    queryFn: () => fetchLeadForConversation(businessId, conversationId)
  });
}

export function conversationHandoffOptions(businessId: string, conversationId: string) {
  return queryOptions({
    queryKey: inboxKeys.handoff(businessId, conversationId),
    queryFn: () => fetchHandoffForConversation(businessId, conversationId)
  });
}

function conversationActionMutation(
  action: (businessId: string, conversationId: string) => Promise<ConversationActionResult>,
  businessId: string
) {
  return mutationOptions({
    mutationFn: (conversationId: string) => action(businessId, conversationId),
    onSuccess: (result) => {
      if (result.success) {
        void getQueryClient().invalidateQueries({ queryKey: inboxKeys.conversations(businessId) });
      }
    }
  });
}

export function takeOverMutation(businessId: string) {
  return conversationActionMutation(takeOverConversation, businessId);
}

export function returnToAIMutation(businessId: string) {
  return conversationActionMutation(returnToAIConversation, businessId);
}

export function resolveConversationMutation(businessId: string) {
  return conversationActionMutation(resolveConversation, businessId);
}

export function reopenConversationMutation(businessId: string) {
  return conversationActionMutation(reopenConversation, businessId);
}
