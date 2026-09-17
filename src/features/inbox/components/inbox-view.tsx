'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useQueryState } from 'nuqs';
import { useQuery } from '@tanstack/react-query';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import { useInboxStore } from '../utils/store';
import { conversationsOptions } from '../api/queries';
import { SESSION_EXPIRED_MESSAGE } from '../api/types';
import { ConversationListPanel } from './conversation-list-panel';
import { ActiveConversationPanel } from './active-conversation-panel';
import { CustomerDetailsPanel } from './customer-details-panel';
import { CustomerDetailsSheet } from './customer-details-sheet';

export function InboxView({ businessId }: { businessId: string }) {
  const {
    data: conversations,
    isPending,
    isError,
    error,
    refetch
  } = useQuery(conversationsOptions(businessId));

  const selectedConversationId = useInboxStore((state) => state.selectedConversationId);
  const selectConversation = useInboxStore((state) => state.selectConversation);
  const openConversation = useInboxStore((state) => state.openConversation);
  const mobileView = useInboxStore((state) => state.mobileView);
  const setCustomerSheetOpen = useInboxStore((state) => state.setCustomerSheetOpen);

  // Deep-link support for "Open in Inbox" (see
  // src/features/leads/components/lead-details-sheet.tsx) — a
  // conversation id in the URL, e.g. /dashboard/inbox?conversation=<id>,
  // opens that conversation once the list has loaded and clears itself
  // from the URL so it never fights a later manual selection. Applied
  // at most once per page load; an id that doesn't belong to any
  // conversation this business owns is silently ignored, same as a
  // stale or forged one.
  const [conversationParam, setConversationParam] = useQueryState('conversation');
  const appliedConversationParamRef = useRef(false);

  useEffect(() => {
    if (appliedConversationParamRef.current) return;
    if (!conversationParam || !conversations) return;
    appliedConversationParamRef.current = true;
    if (conversations.some((c) => c.id === conversationParam)) {
      openConversation(conversationParam);
    }
    void setConversationParam(null);
  }, [conversationParam, conversations, openConversation, setConversationParam]);

  // Auto-select the first conversation once the list loads, without
  // forcing mobile navigation into the thread — only an explicit tap on
  // a row (ConversationRow -> openConversation) or the deep-link above
  // does that.
  useEffect(() => {
    if (!conversations || conversations.length === 0) return;
    if (selectedConversationId && conversations.some((c) => c.id === selectedConversationId)) {
      return;
    }
    if (conversationParam) return; // let the deep-link effect above win the race
    selectConversation(conversations[0].id);
  }, [conversations, selectedConversationId, selectConversation, conversationParam]);

  if (isError) {
    const message = error instanceof Error ? error.message : 'Please try again.';
    const sessionExpired = message === SESSION_EXPIRED_MESSAGE;

    return (
      <div className='flex h-[calc(100dvh-5.5rem)] min-h-0 w-full min-w-0 items-center justify-center'>
        <Empty>
          <EmptyMedia variant='icon'>
            <Icons.alertCircle aria-hidden='true' />
          </EmptyMedia>
          <EmptyTitle>{sessionExpired ? 'Session expired' : 'Inbox unavailable'}</EmptyTitle>
          <EmptyDescription>{message}</EmptyDescription>
          {sessionExpired ? (
            <Button
              render={<Link href='/login?next=/dashboard/inbox' aria-label='Sign in again' />}
            >
              Sign in again
            </Button>
          ) : (
            <Button type='button' variant='outline' onClick={() => refetch()}>
              <Icons.refresh className='size-4' aria-hidden='true' />
              Try again
            </Button>
          )}
        </Empty>
      </div>
    );
  }

  const activeConversation = conversations?.find((c) => c.id === selectedConversationId);

  return (
    <div className='flex h-[calc(100dvh-5.5rem)] min-h-0 w-full min-w-0 gap-3 overflow-hidden'>
      <ConversationListPanel
        businessId={businessId}
        className={cn(
          'min-w-0 w-full md:w-[300px] md:shrink-0 lg:w-[320px]',
          mobileView === 'thread' ? 'hidden md:flex' : 'flex'
        )}
      />

      <div className={cn('min-w-0 flex-1', mobileView === 'list' ? 'hidden md:flex' : 'flex')}>
        {isPending ? (
          <div
            className='flex h-full w-full flex-col gap-3 rounded-xl border border-dashed p-3'
            aria-hidden='true'
          >
            <Skeleton className='h-10 w-1/2' />
            <Skeleton className='h-16 w-2/3' />
            <Skeleton className='ml-auto h-16 w-2/3' />
          </div>
        ) : activeConversation ? (
          <ActiveConversationPanel
            businessId={businessId}
            conversation={activeConversation}
            className='w-full'
            onOpenCustomerDetails={() => setCustomerSheetOpen(true)}
          />
        ) : (
          <div className='flex h-full w-full items-center justify-center rounded-xl border border-dashed'>
            <Empty>
              <EmptyMedia variant='icon'>
                <Icons.chat aria-hidden='true' />
              </EmptyMedia>
              <EmptyTitle>No conversation selected</EmptyTitle>
              <EmptyDescription>
                Choose a conversation from the list to see it here.
              </EmptyDescription>
            </Empty>
          </div>
        )}
      </div>

      {activeConversation && (
        <CustomerDetailsPanel
          businessId={businessId}
          conversation={activeConversation}
          className='w-[300px] shrink-0 lg:w-[320px]'
        />
      )}

      <CustomerDetailsSheet businessId={businessId} conversation={activeConversation} />
    </div>
  );
}
