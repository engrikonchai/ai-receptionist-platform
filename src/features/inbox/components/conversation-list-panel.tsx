'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { cn } from '@/lib/utils';
import { useInboxStore } from '../utils/store';
import { CHANNEL_LABEL, conversationAttention } from '../utils/format';
import { StatusPill } from '@/components/ui/status-pill';
import { conversationsOptions } from '../api/queries';
import { SESSION_EXPIRED_MESSAGE } from '../api/types';
import type { ConversationChannel, ConversationListItem, InboxStatusFilter } from '../api/types';
import { ChannelIcon } from './channel-icon';
import { ConversationRow } from './conversation-row';

const STATUS_FILTERS: { value: InboxStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'handed_off', label: 'Handed off' },
  { value: 'closed', label: 'Closed' }
];

const CHANNELS: ConversationChannel[] = ['website', 'instagram', 'whatsapp'];

function matchesStatus(item: ConversationListItem, filter: InboxStatusFilter) {
  return filter === 'all' || item.status === filter;
}

function matchesQuery(item: ConversationListItem, query: string) {
  if (!query) return true;
  const haystack = [item.displayName, item.leadContact ?? '', item.latestMessagePreview ?? '']
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function ConversationListSkeleton() {
  return (
    <div className='space-y-2 p-1' aria-hidden='true'>
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className='flex items-start gap-2.5 rounded-lg p-2.5'>
          <Skeleton className='size-8 shrink-0 rounded-full' />
          <div className='min-w-0 flex-1 space-y-2'>
            <Skeleton className='h-3.5 w-2/3' />
            <Skeleton className='h-3 w-full' />
            <Skeleton className='h-3 w-1/3' />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ConversationListPanel({
  businessId,
  className
}: {
  businessId: string;
  className?: string;
}) {
  const {
    data: conversations,
    isPending,
    isError,
    error,
    refetch
  } = useQuery(conversationsOptions(businessId));

  const selectedConversationId = useInboxStore((state) => state.selectedConversationId);
  const searchQuery = useInboxStore((state) => state.searchQuery);
  const statusFilter = useInboxStore((state) => state.statusFilter);
  const channelFilters = useInboxStore((state) => state.channelFilters);
  const openConversation = useInboxStore((state) => state.openConversation);
  const setSearchQuery = useInboxStore((state) => state.setSearchQuery);
  const setStatusFilter = useInboxStore((state) => state.setStatusFilter);
  const toggleChannelFilter = useInboxStore((state) => state.toggleChannelFilter);

  const filtered = useMemo(() => {
    if (!conversations) return [];
    const query = searchQuery.trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (!matchesStatus(conversation, statusFilter)) return false;
      if (channelFilters.length > 0 && !channelFilters.includes(conversation.channel)) {
        return false;
      }
      return matchesQuery(conversation, query);
    });
  }, [conversations, searchQuery, statusFilter, channelFilters]);

  const needsYouCount = useMemo(
    () => (conversations ?? []).filter((c) => conversationAttention(c) === 'needs_you').length,
    [conversations]
  );
  // Channel filters only earn their space once the data actually spans
  // more than one channel (Instagram/WhatsApp can't have conversations
  // until those channels ship — see the Channels page).
  const availableChannels = useMemo(
    () => CHANNELS.filter((channel) => (conversations ?? []).some((c) => c.channel === channel)),
    [conversations]
  );

  const errorMessage = error instanceof Error ? error.message : 'Please try again.';
  const isSessionExpired = isError && errorMessage === SESSION_EXPIRED_MESSAGE;

  return (
    <Card className={cn('flex h-full min-h-0 flex-col gap-0 overflow-hidden p-0', className)}>
      <div className='flex flex-col gap-3 border-b p-3 pb-3.5'>
        <div className='flex items-center justify-between gap-2'>
          <h2 className='font-display text-foreground text-[22px] leading-none font-semibold'>
            Inbox
          </h2>
          <div className='flex items-center gap-2'>
            {needsYouCount > 0 && (
              <StatusPill tone='attention' dot>
                {needsYouCount} need{needsYouCount === 1 ? 's' : ''} you
              </StatusPill>
            )}
            <span className='text-muted-foreground text-xs'>
              {conversations
                ? `${conversations.length} conversation${conversations.length === 1 ? '' : 's'}`
                : ''}
            </span>
          </div>
        </div>

        <label htmlFor='inbox-search' className='sr-only'>
          Search conversations
        </label>
        <div className='relative'>
          <Icons.search
            className='text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2'
            aria-hidden='true'
          />
          <Input
            id='inbox-search'
            type='search'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder='Search conversations'
            className='bg-background h-10 pl-9'
            disabled={!conversations || conversations.length === 0}
          />
        </div>

        <div
          role='group'
          aria-label='Filter by status'
          className='bg-secondary flex items-center gap-0.5 rounded-lg p-0.5'
        >
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type='button'
              aria-pressed={statusFilter === filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={cn(
                'focus-visible:ring-ring min-h-8 flex-1 touch-manipulation rounded-md px-2 text-xs font-bold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none',
                statusFilter === filter.value
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {availableChannels.length > 1 && (
          <div
            role='group'
            aria-label='Filter by channel'
            className='flex flex-wrap items-center gap-1.5'
          >
            {availableChannels.map((channel) => {
              const active = channelFilters.includes(channel);
              return (
                <button
                  key={channel}
                  type='button'
                  aria-pressed={active}
                  onClick={() => toggleChannelFilter(channel)}
                  className={cn(
                    'focus-visible:ring-ring inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:outline-none',
                    active
                      ? 'border-primary/40 bg-accent text-accent-foreground'
                      : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  <ChannelIcon channel={channel} className='size-3.5' />
                  {CHANNEL_LABEL[channel]}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div
        className='min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain p-2'
        role='list'
        aria-label='Conversations'
      >
        {isPending && <ConversationListSkeleton />}

        {isError && (
          <Empty className='h-full border-none'>
            <EmptyMedia variant='icon'>
              <Icons.alertCircle aria-hidden='true' />
            </EmptyMedia>
            <EmptyTitle>
              {isSessionExpired ? 'Session expired' : 'Could not load conversations'}
            </EmptyTitle>
            <EmptyDescription>{errorMessage}</EmptyDescription>
            {isSessionExpired ? (
              <Button
                size='sm'
                render={<Link href='/login?next=/dashboard/inbox' aria-label='Sign in again' />}
              >
                Sign in again
              </Button>
            ) : (
              <Button type='button' variant='outline' size='sm' onClick={() => refetch()}>
                <Icons.refresh className='size-3.5' aria-hidden='true' />
                Try again
              </Button>
            )}
          </Empty>
        )}

        {!isPending && !isError && conversations && conversations.length === 0 && (
          <Empty className='h-full border-none'>
            <EmptyMedia variant='icon'>
              <Icons.chat aria-hidden='true' />
            </EmptyMedia>
            <EmptyTitle>No conversations yet</EmptyTitle>
            <EmptyDescription>
              New conversations will appear here once customers start chatting.
            </EmptyDescription>
          </Empty>
        )}

        {!isPending &&
          !isError &&
          conversations &&
          conversations.length > 0 &&
          filtered.length === 0 && (
            <Empty className='h-full border-none'>
              <EmptyMedia variant='icon'>
                <Icons.search aria-hidden='true' />
              </EmptyMedia>
              <EmptyTitle>No conversations found</EmptyTitle>
              <EmptyDescription>
                Try a different search term or clear your filters.
              </EmptyDescription>
            </Empty>
          )}

        {!isPending &&
          !isError &&
          filtered.map((conversation) => (
            <div key={conversation.id} role='listitem'>
              <ConversationRow
                conversation={conversation}
                isActive={conversation.id === selectedConversationId}
                onSelect={openConversation}
              />
            </div>
          ))}
      </div>
    </Card>
  );
}
