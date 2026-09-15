'use client';

import { useMemo } from 'react';
import { Icons } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { cn } from '@/lib/utils';
import { useInboxStore } from '../utils/store';
import { CHANNEL_LABEL } from '../utils/format';
import type { Channel, Conversation, StatusFilter } from '../utils/types';
import { ChannelIcon } from './channel-icon';
import { ConversationRow } from './conversation-row';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'needs_attention', label: 'Needs attention' },
  { value: 'resolved', label: 'Resolved' }
];

const CHANNELS: Channel[] = ['website', 'instagram', 'whatsapp'];

function matchesStatus(conversation: Conversation, filter: StatusFilter) {
  switch (filter) {
    case 'unread':
      return conversation.unreadCount > 0;
    case 'needs_attention':
      return conversation.status === 'needs_attention';
    case 'resolved':
      return conversation.status === 'resolved';
    default:
      return true;
  }
}

export function ConversationListPanel({ className }: { className?: string }) {
  const conversations = useInboxStore((state) => state.conversations);
  const selectedConversationId = useInboxStore((state) => state.selectedConversationId);
  const searchQuery = useInboxStore((state) => state.searchQuery);
  const statusFilter = useInboxStore((state) => state.statusFilter);
  const channelFilters = useInboxStore((state) => state.channelFilters);
  const selectConversation = useInboxStore((state) => state.selectConversation);
  const setSearchQuery = useInboxStore((state) => state.setSearchQuery);
  const setStatusFilter = useInboxStore((state) => state.setStatusFilter);
  const toggleChannelFilter = useInboxStore((state) => state.toggleChannelFilter);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (!matchesStatus(conversation, statusFilter)) return false;
      if (channelFilters.length > 0 && !channelFilters.includes(conversation.channel)) {
        return false;
      }
      if (!query) return true;
      const lastMessage = conversation.messages[conversation.messages.length - 1];
      const haystack = [
        conversation.customer.name,
        conversation.customer.email,
        lastMessage?.text ?? ''
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [conversations, searchQuery, statusFilter, channelFilters]);

  return (
    <Card className={cn('flex h-full min-h-0 flex-col gap-0 overflow-hidden p-0', className)}>
      <div className='flex flex-col gap-3 border-b p-3'>
        <div className='flex items-center justify-between gap-2'>
          <h2 className='text-foreground text-base font-semibold'>Inbox</h2>
          <span className='text-muted-foreground text-xs'>
            {conversations.length} conversation{conversations.length === 1 ? '' : 's'}
          </span>
        </div>

        <label htmlFor='inbox-search' className='sr-only'>
          Search conversations
        </label>
        <div className='relative'>
          <Icons.search
            className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2'
            aria-hidden='true'
          />
          <Input
            id='inbox-search'
            type='search'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder='Search conversations'
            className='pl-8'
          />
        </div>

        <div
          role='group'
          aria-label='Filter by status'
          className='flex flex-wrap items-center gap-1.5'
        >
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type='button'
              aria-pressed={statusFilter === filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={cn(
                'focus-visible:ring-ring focus-visible:ring-offset-background rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
                statusFilter === filter.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div
          role='group'
          aria-label='Filter by channel'
          className='flex flex-wrap items-center gap-1.5'
        >
          {CHANNELS.map((channel) => {
            const active = channelFilters.includes(channel);
            return (
              <button
                key={channel}
                type='button'
                aria-pressed={active}
                onClick={() => toggleChannelFilter(channel)}
                className={cn(
                  'focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
                  active
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                <ChannelIcon channel={channel} className='size-3.5' />
                {CHANNEL_LABEL[channel]}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className='min-h-0 flex-1 space-y-1 overflow-y-auto p-2'
        role='list'
        aria-label='Conversations'
      >
        {filtered.length === 0 ? (
          <Empty className='h-full border-none'>
            <EmptyMedia variant='icon'>
              <Icons.search aria-hidden='true' />
            </EmptyMedia>
            <EmptyTitle>No conversations found</EmptyTitle>
            <EmptyDescription>Try a different search term or clear your filters.</EmptyDescription>
          </Empty>
        ) : (
          filtered.map((conversation) => (
            <div key={conversation.id} role='listitem'>
              <ConversationRow
                conversation={conversation}
                isActive={conversation.id === selectedConversationId}
                onSelect={selectConversation}
              />
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
