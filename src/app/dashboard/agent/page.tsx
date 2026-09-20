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
import { agentSettingsOptions } from '@/features/agent-settings/api/queries';
import { AgentSettingsView } from '@/features/agent-settings/components/agent-settings-view';

const PAGE_TITLE = 'Agent';
const PAGE_DESCRIPTION = 'Define how your assistant should communicate with visitors.';

function AgentEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <PageContainer pageTitle={PAGE_TITLE} pageDescription={PAGE_DESCRIPTION}>
      <Empty className='mt-6'>
        <EmptyMedia variant='icon'>
          <Icons.aiAgent aria-hidden='true' />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </Empty>
    </PageContainer>
  );
}

export default async function AgentPage() {
  const ctx = await loadOwnerContext();

  // dashboard/layout.tsx already enforces auth + onboarding-completed +
  // profile/business presence for every /dashboard/* route before this
  // page ever renders, so `ctx.status` is always 'ok' here in practice —
  // this fallback only guards against that invariant somehow not
  // holding, matching every other dashboard page's own fallback.
  if (ctx.status !== 'ok') {
    return (
      <AgentEmptyState
        title='Agent settings unavailable'
        description='Sign in to configure your assistant.'
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
      <AgentEmptyState title='No business found' description='Contact support if this persists.' />
    );
  }

  const queryClient = getQueryClient();
  await queryClient.fetchQuery(agentSettingsOptions(activeBusinessId)).catch(() => {});

  return (
    <PageContainer pageTitle={PAGE_TITLE} pageDescription={PAGE_DESCRIPTION}>
      <div className='mt-6'>
        <HydrationBoundary state={dehydrate(queryClient)}>
          <AgentSettingsView businessId={activeBusinessId} />
        </HydrationBoundary>
      </div>
    </PageContainer>
  );
}
