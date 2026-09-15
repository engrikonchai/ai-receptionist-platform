/**
 * Deliberately NOT `'use client'`. These are plain `queryOptions()` /
 * `mutationOptions()` factories — no hooks, no browser APIs — so they
 * must stay callable from both worlds: directly, in-process, from a
 * Server Component doing `queryClient.prefetchQuery(conversationsOptions(id))`
 * (see src/app/dashboard/inbox/page.tsx), and from Client Components via
 * `useQuery`/`useMutation`. A `'use client'` directive here would turn
 * every export — `conversationsOptions` included — into an opaque
 * client reference wherever this module is imported, which a Server
 * Component can render as JSX but never call as a function. That
 * mismatch is exactly what produced the production 500 on
 * /dashboard/inbox ("Attempted to call conversationsOptions() from the
 * server but conversationsOptions is on the client"): `next build`
 * doesn't render this route (it's fully dynamic), so the break only
 * surfaced on a real, authenticated request. Both sides share this same
 * file and its `inboxKeys` factory, so the query keys used for
 * server-side prefetching and client-side hydration are always
 * identical — never re-derive them separately.
 */
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
