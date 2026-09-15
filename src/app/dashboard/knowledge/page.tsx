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
import { knowledgeItemsOptions } from '@/features/knowledge/api/queries';
import { AddKnowledgeButton } from '@/features/knowledge/components/add-knowledge-button';
import { KnowledgeView } from '@/features/knowledge/components/knowledge-view';

const PAGE_TITLE = 'Knowledge Base';
const PAGE_DESCRIPTION =
  'Active answers here are what the AI receptionist uses to reply to customers.';

function KnowledgeEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <PageContainer pageTitle={PAGE_TITLE} pageDescription={PAGE_DESCRIPTION}>
      <Empty className='mt-6'>
        <EmptyMedia variant='icon'>
          <Icons.knowledge aria-hidden='true' />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </Empty>
    </PageContainer>
  );
}

export default async function KnowledgePage() {
  const ctx = await loadOwnerContext();

  // dashboard/layout.tsx already enforces auth + onboarding-completed +
  // profile/business presence for every /dashboard/* route before this
  // page ever renders, so `ctx.status` is always 'ok' here in practice —
  // this fallback only guards against that invariant somehow not
  // holding, matching every other dashboard page's own fallback.
  if (ctx.status !== 'ok') {
    return (
      <KnowledgeEmptyState
        title='Knowledge Base unavailable'
        description='Sign in to manage your knowledge base.'
      />
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
      <KnowledgeEmptyState
        title='No business found'
        description='Contact support if this persists.'
      />
    );
  }

  const queryClient = getQueryClient();
  void queryClient.prefetchQuery(knowledgeItemsOptions(activeBusiness.id));

  return (
    <PageContainer
      pageTitle={PAGE_TITLE}
      pageDescription={PAGE_DESCRIPTION}
      pageHeaderAction={<AddKnowledgeButton />}
    >
      <HydrationBoundary state={dehydrate(queryClient)}>
        <KnowledgeView
          businessId={activeBusiness.id}
          defaultLanguage={activeBusiness.default_language}
          supportedLanguages={activeBusiness.supported_languages}
        />
      </HydrationBoundary>
    </PageContainer>
  );
}
