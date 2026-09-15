/**
 * Deliberately NOT `'use client'` — see the identical note in
 * src/features/inbox/api/queries.ts for why: these are plain
 * `queryOptions()` / `mutationOptions()` factories with no hooks and no
 * browser APIs, so they must stay callable directly from a Server
 * Component (src/app/dashboard/knowledge/page.tsx's prefetch call) as
 * well as from Client Components via useQuery/useMutation. A
 * `'use client'` directive here would turn every export into an opaque
 * client reference wherever this module is imported — exactly the bug
 * that caused a production 500 on /dashboard/inbox previously.
 */
import { mutationOptions, queryOptions } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import {
  createKnowledgeItem,
  deleteKnowledgeItem,
  fetchKnowledgeItems,
  toggleKnowledgeItem,
  updateKnowledgeItem,
  type KnowledgeItemFormInput
} from './service';

export const knowledgeKeys = {
  items: (businessId: string) => ['knowledge', businessId, 'items'] as const
};

export function knowledgeItemsOptions(businessId: string) {
  return queryOptions({
    queryKey: knowledgeKeys.items(businessId),
    queryFn: () => fetchKnowledgeItems(businessId)
  });
}

function invalidateKnowledgeItems(businessId: string) {
  void getQueryClient().invalidateQueries({ queryKey: knowledgeKeys.items(businessId) });
}

export function createKnowledgeItemMutation(businessId: string) {
  return mutationOptions({
    mutationFn: (input: Omit<KnowledgeItemFormInput, 'businessId'>) =>
      createKnowledgeItem({ businessId, ...input }),
    onSuccess: (result) => {
      if (result.success) invalidateKnowledgeItems(businessId);
    }
  });
}

export function updateKnowledgeItemMutation(businessId: string) {
  return mutationOptions({
    mutationFn: (input: Omit<KnowledgeItemFormInput, 'businessId'> & { itemId: string }) =>
      updateKnowledgeItem({ businessId, ...input }),
    onSuccess: (result) => {
      if (result.success) invalidateKnowledgeItems(businessId);
    }
  });
}

export function toggleKnowledgeItemMutation(businessId: string) {
  return mutationOptions({
    mutationFn: (input: { itemId: string; isActive: boolean }) =>
      toggleKnowledgeItem(businessId, input.itemId, input.isActive),
    onSuccess: (result) => {
      if (result.success) invalidateKnowledgeItems(businessId);
    }
  });
}

export function deleteKnowledgeItemMutation(businessId: string) {
  return mutationOptions({
    mutationFn: (itemId: string) => deleteKnowledgeItem(businessId, itemId),
    onSuccess: (result) => {
      if (result.success) invalidateKnowledgeItems(businessId);
    }
  });
}
