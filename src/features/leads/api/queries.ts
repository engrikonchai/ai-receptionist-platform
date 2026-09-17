/**
 * Deliberately NOT `'use client'` — see the identical note in
 * src/features/inbox/api/queries.ts. Plain `queryOptions()` /
 * `mutationOptions()` factories, callable both from a Server Component
 * doing `queryClient.prefetchQuery(leadsListOptions(id))` and from
 * Client Components via `useQuery`/`useMutation`.
 */
import { mutationOptions, queryOptions } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import { fetchLeadDetails, fetchLeads, updateLeadStatus } from './service';
import type { LeadStatus } from './types';

export const leadsKeys = {
  list: (businessId: string) => ['leads', businessId, 'list'] as const,
  detail: (businessId: string, leadId: string) => ['leads', businessId, 'detail', leadId] as const
};

export function leadsListOptions(businessId: string) {
  return queryOptions({
    queryKey: leadsKeys.list(businessId),
    queryFn: () => fetchLeads(businessId)
  });
}

export function leadDetailsOptions(businessId: string, leadId: string) {
  return queryOptions({
    queryKey: leadsKeys.detail(businessId, leadId),
    queryFn: () => fetchLeadDetails(businessId, leadId)
  });
}

export function updateLeadStatusMutation(businessId: string) {
  return mutationOptions({
    mutationFn: ({ leadId, status }: { leadId: string; status: LeadStatus }) =>
      updateLeadStatus(businessId, leadId, status),
    onSuccess: (result, variables) => {
      if (!result.success) return;
      const queryClient = getQueryClient();
      void queryClient.invalidateQueries({ queryKey: leadsKeys.list(businessId) });
      void queryClient.invalidateQueries({
        queryKey: leadsKeys.detail(businessId, variables.leadId)
      });
    }
  });
}
