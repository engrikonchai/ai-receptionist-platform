/**
 * Deliberately NOT `'use client'` — see the identical note in
 * src/features/widget/api/queries.ts for why: these are plain
 * `queryOptions()` / `mutationOptions()` factories with no hooks and no
 * browser APIs, so they must stay callable directly from a Server
 * Component (src/app/dashboard/agent/page.tsx's prefetch call) as well
 * as from Client Components via useQuery/useMutation.
 */
import { mutationOptions, queryOptions } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import { fetchAgentSettings, updateAgentSettings } from './service';
import type { AgentSettingsInput } from './types';

export const agentSettingsKeys = {
  settings: (businessId: string) => ['agent-settings', businessId, 'settings'] as const
};

export function agentSettingsOptions(businessId: string) {
  return queryOptions({
    queryKey: agentSettingsKeys.settings(businessId),
    queryFn: () => fetchAgentSettings(businessId)
  });
}

export function updateAgentSettingsMutation(businessId: string) {
  return mutationOptions({
    mutationFn: (input: AgentSettingsInput) => updateAgentSettings(businessId, input),
    onSuccess: (result) => {
      if (result.success) {
        void getQueryClient().invalidateQueries({
          queryKey: agentSettingsKeys.settings(businessId)
        });
      }
    }
  });
}
