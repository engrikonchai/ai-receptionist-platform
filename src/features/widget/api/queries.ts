/**
 * Deliberately NOT `'use client'` — see the identical note in
 * src/features/inbox/api/queries.ts for why: these are plain
 * `queryOptions()` / `mutationOptions()` factories with no hooks and no
 * browser APIs, so they must stay callable directly from a Server
 * Component (src/app/dashboard/widget/page.tsx's prefetch call) as well
 * as from Client Components via useQuery/useMutation.
 */
import { mutationOptions, queryOptions } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import { fetchWidgetSettings, saveWidgetSettings } from './service';
import type { WidgetSettingsInput } from './types';

export const widgetKeys = {
  settings: (businessId: string) => ['widget', businessId, 'settings'] as const
};

export function widgetSettingsOptions(businessId: string) {
  return queryOptions({
    queryKey: widgetKeys.settings(businessId),
    queryFn: () => fetchWidgetSettings(businessId)
  });
}

export function saveWidgetSettingsMutation(businessId: string, defaultLanguage: string) {
  return mutationOptions({
    mutationFn: (input: WidgetSettingsInput) =>
      saveWidgetSettings(businessId, defaultLanguage, input),
    onSuccess: (result) => {
      if (result.success) {
        void getQueryClient().invalidateQueries({ queryKey: widgetKeys.settings(businessId) });
      }
    }
  });
}
