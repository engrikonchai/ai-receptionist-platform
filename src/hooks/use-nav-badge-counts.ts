'use client';

import { useQuery } from '@tanstack/react-query';
import { conversationsOptions } from '@/features/inbox/api/queries';
import { leadsListOptions } from '@/features/leads/api/queries';

/**
 * Sidebar nav badge counts — pending handoffs (Inbox) and new leads
 * (Leads). Deliberately reuses the exact same React Query cache the
 * Inbox and Leads pages themselves populate
 * (conversationsOptions/leadsListOptions — see
 * src/features/inbox/api/queries.ts and src/features/leads/api/queries.ts),
 * rather than a separate count endpoint: a mutation that already
 * invalidates those query keys (takeOverConversation,
 * resolveConversation, updateLeadStatus, ...) recomputes these counts
 * for free, with no new polling and no new network surface. Not a
 * notification center — just a live read of data already being fetched
 * for those pages.
 *
 * `businessId: null` (no resolved active business yet) renders as zero
 * counts rather than an error — the sidebar is global chrome and must
 * never look broken while the rest of the page is still resolving one.
 */
export function useNavBadgeCounts(businessId: string | null) {
  const conversationsQuery = useQuery({
    ...conversationsOptions(businessId ?? ''),
    enabled: Boolean(businessId)
  });
  const leadsQuery = useQuery({
    ...leadsListOptions(businessId ?? ''),
    enabled: Boolean(businessId)
  });

  const pendingHandoffCount =
    conversationsQuery.data?.filter((conversation) => conversation.handoffStatus === 'new')
      .length ?? 0;
  const newLeadCount = leadsQuery.data?.filter((lead) => lead.status === 'new').length ?? 0;

  return { pendingHandoffCount, newLeadCount };
}
