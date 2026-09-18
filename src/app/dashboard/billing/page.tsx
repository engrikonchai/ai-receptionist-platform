import { cookies } from 'next/headers';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import PageContainer from '@/components/layout/page-container';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Icons } from '@/components/icons';
import { getQueryClient } from '@/lib/query-client';
import {
  ACTIVE_BUSINESS_COOKIE,
  loadOwnerContext,
  resolveActiveBusinessId
} from '@/lib/supabase/owner-context';
import { billingStatusOptions } from '@/features/billing/api/queries';
import { BillingView } from '@/features/billing/components/billing-view';

const PAGE_TITLE = 'Billing';
const PAGE_DESCRIPTION = 'Manage your subscription and payment method.';

function BillingEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <PageContainer pageTitle={PAGE_TITLE} pageDescription={PAGE_DESCRIPTION}>
      <Empty className='mt-6'>
        <EmptyMedia variant='icon'>
          <Icons.billing aria-hidden='true' />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </Empty>
    </PageContainer>
  );
}

export default async function BillingPage() {
  const ctx = await loadOwnerContext();

  // dashboard/layout.tsx already enforces auth + onboarding-completed +
  // profile/business presence for every /dashboard/* route before this
  // page ever renders, so `ctx.status` is always 'ok' here in practice —
  // this fallback only guards against that invariant somehow not
  // holding, matching every other dashboard page's own fallback.
  if (ctx.status !== 'ok') {
    return (
      <BillingEmptyState title='Billing unavailable' description='Sign in to manage billing.' />
    );
  }

  const cookieStore = await cookies();
  const activeBusinessId = resolveActiveBusinessId(
    ctx.businesses,
    cookieStore.get(ACTIVE_BUSINESS_COOKIE)?.value
  );
  const activeBusiness = ctx.businesses.find((b) => b.id === activeBusinessId) ?? null;

  if (!activeBusiness) {
    return (
      <BillingEmptyState
        title='No business found'
        description='Contact support if this persists.'
      />
    );
  }

  const queryClient = getQueryClient();
  void queryClient.prefetchQuery(billingStatusOptions(activeBusiness.id));

  return (
    <PageContainer pageTitle={PAGE_TITLE} pageDescription={PAGE_DESCRIPTION}>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <BillingView businessId={activeBusiness.id} />
      </HydrationBoundary>
    </PageContainer>
  );
}
