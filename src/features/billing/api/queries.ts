/**
 * Deliberately NOT `'use client'` — see the identical note in
 * src/features/inbox/api/queries.ts and every other feature's
 * queries.ts. Plain `queryOptions()` / `mutationOptions()` factories,
 * callable both from a Server Component doing
 * `queryClient.prefetchQuery(billingStatusOptions(id))` and from Client
 * Components via `useQuery`/`useMutation`.
 */
import { mutationOptions, queryOptions } from '@tanstack/react-query';
import { fetchBillingStatus, openCustomerPortal, startCheckout } from './service';

export const billingKeys = {
  status: (businessId: string) => ['billing', businessId, 'status'] as const
};

export function billingStatusOptions(businessId: string) {
  return queryOptions({
    queryKey: billingKeys.status(businessId),
    queryFn: () => fetchBillingStatus(businessId)
  });
}

export function startCheckoutMutation(businessId: string) {
  return mutationOptions({
    mutationFn: () => startCheckout(businessId)
  });
}

export function openCustomerPortalMutation(businessId: string) {
  return mutationOptions({
    mutationFn: () => openCustomerPortal(businessId)
  });
}
