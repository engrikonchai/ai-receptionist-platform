import { cookies } from 'next/headers';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import PageContainer from '@/components/layout/page-container';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Icons } from '@/components/icons';
import { getQueryClient } from '@/lib/query-client';
import { getSiteUrl } from '@/lib/site-url';
import {
  ACTIVE_BUSINESS_COOKIE,
  loadOwnerContext,
  resolveActiveBusinessId
} from '@/lib/supabase/owner-context';
import { widgetSettingsOptions } from '@/features/widget/api/queries';
import { WidgetView } from '@/features/widget/components/widget-view';

const PAGE_TITLE = 'Widget';
const PAGE_DESCRIPTION =
  'Configure the chat widget your website visitors see, then install it with one snippet.';

function WidgetEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <PageContainer pageTitle={PAGE_TITLE} pageDescription={PAGE_DESCRIPTION}>
      <Empty className='mt-6'>
        <EmptyMedia variant='icon'>
          <Icons.code aria-hidden='true' />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </Empty>
    </PageContainer>
  );
}

export default async function WidgetPage() {
  const ctx = await loadOwnerContext();

  // dashboard/layout.tsx already enforces auth + onboarding-completed +
  // profile/business presence for every /dashboard/* route before this
  // page ever renders, so `ctx.status` is always 'ok' here in practice —
  // this fallback only guards against that invariant somehow not
  // holding, matching every other dashboard page's own fallback.
  if (ctx.status !== 'ok') {
    return (
      <WidgetEmptyState
        title='Widget settings unavailable'
        description='Sign in to configure your widget.'
      />
    );
  }

  const cookieStore = await cookies();
  const activeBusinessId = resolveActiveBusinessId(
    ctx.businesses,
    cookieStore.get(ACTIVE_BUSINESS_COOKIE)?.value
  );

  if (!activeBusinessId) {
    return (
      <WidgetEmptyState title='No business found' description='Contact support if this persists.' />
    );
  }

  const queryClient = getQueryClient();
  await queryClient.fetchQuery(widgetSettingsOptions(activeBusinessId)).catch(() => {});

  return (
    <PageContainer pageTitle={PAGE_TITLE} pageDescription={PAGE_DESCRIPTION}>
      <div className='mt-6'>
        <HydrationBoundary state={dehydrate(queryClient)}>
          <WidgetView businessId={activeBusinessId} siteOrigin={getSiteUrl()} />
        </HydrationBoundary>
      </div>
    </PageContainer>
  );
}
