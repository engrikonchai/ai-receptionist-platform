import { cookies } from 'next/headers';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Icons } from '@/components/icons';
import { getQueryClient } from '@/lib/query-client';
import {
  ACTIVE_BUSINESS_COOKIE,
  loadOwnerContext,
  resolveActiveBusinessId
} from '@/lib/supabase/owner-context';
import { conversationsOptions } from '@/features/inbox/api/queries';
import { InboxView } from '@/features/inbox/components/inbox-view';

function InboxEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className='flex min-h-0 min-w-0 flex-1 items-center justify-center px-4 py-2 md:px-6'>
      <Empty>
        <EmptyMedia variant='icon'>
          <Icons.chat aria-hidden='true' />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </Empty>
    </div>
  );
}

export default async function InboxPage() {
  const ctx = await loadOwnerContext();

  // dashboard/layout.tsx already enforces auth + onboarding-completed +
  // profile/business presence for every /dashboard/* route before this
  // page ever renders, so `ctx.status` is always 'ok' here in practice.
  // This fallback only guards against that invariant somehow not
  // holding, matching overview/page.tsx's own fallback.
  if (ctx.status !== 'ok') {
    return (
      <InboxEmptyState title='Inbox unavailable' description='Sign in to see your conversations.' />
    );
  }

  const cookieStore = await cookies();
  const activeBusinessId = resolveActiveBusinessId(
    ctx.businesses,
    cookieStore.get(ACTIVE_BUSINESS_COOKIE)?.value
  );

  if (!activeBusinessId) {
    return (
      <InboxEmptyState title='No business found' description='Contact support if this persists.' />
    );
  }

  const queryClient = getQueryClient();
  void queryClient.prefetchQuery(conversationsOptions(activeBusinessId));

  return (
    <div className='flex min-h-0 min-w-0 flex-1 px-4 py-2 md:px-6'>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <InboxView businessId={activeBusinessId} />
      </HydrationBoundary>
    </div>
  );
}
