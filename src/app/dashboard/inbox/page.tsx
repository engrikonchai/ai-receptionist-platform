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
import { conversationsOptions, inboxKeys } from '@/features/inbox/api/queries';
import { InboxView } from '@/features/inbox/components/inbox-view';

/**
 * Temporary, safe diagnostics for the "Inbox shows 0 conversations"
 * investigation — logs only the resolved business id, the query key, and
 * row counts (never conversation/customer content, cookies, or tokens).
 * Goes to `console.error` so it's captured by Vercel's server logs.
 * Remove once the production cause is confirmed and resolved.
 */
function logInboxPageDiagnostic(info: Record<string, unknown>) {
  console.error('[inbox:diagnostic:page]', JSON.stringify(info));
}

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
  const queryKey = inboxKeys.conversations(activeBusinessId);

  logInboxPageDiagnostic({ stage: 'before_fetch', businessId: activeBusinessId, queryKey });

  // Deliberately `await`s the fetch (via `fetchQuery`, not the previous
  // `void queryClient.prefetchQuery(...)`) instead of leaving it
  // in-flight. `prefetchQuery` never throws — it swallows a failed
  // queryFn into the cached query's own `status: 'error'` state — but
  // this app's `shouldDehydrateQuery` (see lib/query-client.ts) only
  // dehydrates `success` and `pending` queries, never `error`. Combined
  // with not awaiting, `dehydrate()` used to run against a query that
  // was still `pending` (the queryFn's promise hadn't settled yet on
  // this same synchronous tick) rather than its final settled state —
  // so neither a same-request failure nor a clean success was reliably
  // reflected in what got dehydrated to the client. Awaiting `fetchQuery`
  // here guarantees the query is fully settled (`success` or `error`)
  // before `dehydrate()` runs, and `serverConversationCount`/
  // `serverPrefetchError` below give an exact, logged answer to "did the
  // server-side fetch actually succeed, and with how many rows" —
  // independent of whatever the client ends up doing.
  let serverConversationCount: number | null = null;
  let serverPrefetchError: string | null = null;
  try {
    const conversations = await queryClient.fetchQuery(conversationsOptions(activeBusinessId));
    serverConversationCount = conversations.length;
  } catch (err) {
    serverPrefetchError = err instanceof Error ? err.message : 'Unknown error';
  }

  logInboxPageDiagnostic({
    stage: 'after_fetch',
    businessId: activeBusinessId,
    serverConversationCount,
    serverPrefetchError
  });

  const dehydratedState = dehydrate(queryClient);
  const dehydratedConversationsQuery = dehydratedState.queries.find(
    (q) => JSON.stringify(q.queryKey) === JSON.stringify(queryKey)
  );

  logInboxPageDiagnostic({
    stage: 'dehydrate',
    businessId: activeBusinessId,
    dehydratedQueryKeyCount: dehydratedState.queries.length,
    conversationsQueryIncludedInDehydratedState: Boolean(dehydratedConversationsQuery),
    conversationsQueryDehydratedStatus: dehydratedConversationsQuery?.state.status ?? null
  });

  return (
    <div className='flex min-h-0 min-w-0 flex-1 px-4 py-2 md:px-6'>
      <HydrationBoundary state={dehydratedState}>
        <InboxView
          businessId={activeBusinessId}
          serverConversationCount={serverConversationCount}
        />
      </HydrationBoundary>
    </div>
  );
}
