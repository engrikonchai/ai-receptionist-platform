'use client';

import { useEffect, useRef } from 'react';
import { useMutation, useQuery, type UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Icons } from '@/components/icons';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useInboxStore } from '../utils/store';
import { CHANNEL_LABEL, languageLabel } from '../utils/format';
import {
  conversationMessagesOptions,
  reopenConversationMutation,
  resolveConversationMutation,
  returnToAIMutation,
  takeOverMutation
} from '../api/queries';
import type { ConversationActionResult, ConversationListItem } from '../api/types';
import { ChannelIcon } from './channel-icon';
import {
  ConversationStatusBadge,
  HandoffStatusIndicator,
  HumanTakeoverBadge
} from './status-badge';
import { MessageItem } from './message-item';
import { Composer } from './composer';

function initialsFor(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function MessageSkeleton() {
  return (
    <div className='space-y-4' aria-hidden='true'>
      {[0, 1, 2].map((i) => (
        <div key={i} className={cn('flex items-end gap-2', i % 2 === 1 && 'flex-row-reverse')}>
          <Skeleton className='size-8 shrink-0 rounded-full' />
          <Skeleton className={cn('h-12 rounded-2xl', i % 2 === 1 ? 'w-1/3' : 'w-1/2')} />
        </div>
      ))}
    </div>
  );
}

function runAction(
  mutation: UseMutationResult<ConversationActionResult, Error, string>,
  conversationId: string,
  successMessage: string
) {
  mutation.mutate(conversationId, {
    onSuccess: (result) => {
      if (result.success) toast.success(successMessage);
      else toast.error(result.error);
    },
    onError: () => toast.error('Something went wrong. Please try again.')
  });
}

export function ActiveConversationPanel({
  businessId,
  conversation,
  className,
  onOpenCustomerDetails
}: {
  businessId: string;
  conversation: ConversationListItem;
  className?: string;
  onOpenCustomerDetails: () => void;
}) {
  const setMobileView = useInboxStore((state) => state.setMobileView);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const messagesQuery = useQuery(conversationMessagesOptions(businessId, conversation.id));
  const takeOver = useMutation(takeOverMutation(businessId));
  const returnToAI = useMutation(returnToAIMutation(businessId));
  const resolve = useMutation(resolveConversationMutation(businessId));
  const reopen = useMutation(reopenConversationMutation(businessId));

  const messages = messagesQuery.data?.status === 'ok' ? messagesQuery.data.messages : [];
  const anyActionPending =
    takeOver.isPending || returnToAI.isPending || resolve.isPending || reopen.isPending;

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [conversation.id, messages.length]);

  return (
    <Card
      className={cn('flex h-full min-h-0 min-w-0 flex-col gap-0 overflow-hidden p-0', className)}
    >
      <header className='flex flex-wrap items-center justify-between gap-2 border-b p-3'>
        <div className='flex min-w-0 items-center gap-2.5'>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='md:hidden'
            onClick={() => setMobileView('list')}
            aria-label='Back to conversation list'
          >
            <Icons.arrowLeft className='size-4' />
          </Button>
          <Avatar>
            <AvatarFallback className='bg-primary/10 text-primary text-sm font-semibold'>
              {conversation.hasLeadName ? (
                initialsFor(conversation.displayName)
              ) : (
                <Icons.user className='size-4' aria-hidden='true' />
              )}
            </AvatarFallback>
          </Avatar>
          <div className='min-w-0'>
            <p className='text-foreground truncate text-sm font-semibold'>
              {conversation.displayName}
            </p>
            <div className='text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs'>
              <span className='inline-flex items-center gap-1'>
                <ChannelIcon channel={conversation.channel} />
                {CHANNEL_LABEL[conversation.channel]}
              </span>
              <span aria-hidden='true'>·</span>
              <span>{languageLabel(conversation.detectedLanguage)}</span>
            </div>
          </div>
        </div>

        <div className='flex flex-wrap items-center gap-1.5'>
          <ConversationStatusBadge status={conversation.status} />
          <HumanTakeoverBadge humanTakeover={conversation.humanTakeover} />
          {conversation.handoffStatus && (
            <HandoffStatusIndicator status={conversation.handoffStatus} />
          )}

          {conversation.humanTakeover ? (
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={anyActionPending}
              onClick={() => runAction(returnToAI, conversation.id, 'Returned to AI Receptionist.')}
            >
              <Icons.arrowBackUp className='size-3.5' aria-hidden='true' />
              Return to AI
            </Button>
          ) : (
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={anyActionPending}
              onClick={() =>
                runAction(takeOver, conversation.id, 'You took over this conversation.')
              }
            >
              <Icons.humanAgent className='size-3.5' aria-hidden='true' />
              Take over
            </Button>
          )}

          {conversation.status === 'closed' ? (
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={anyActionPending}
              onClick={() => runAction(reopen, conversation.id, 'Conversation reopened.')}
            >
              <Icons.refresh className='size-3.5' aria-hidden='true' />
              Reopen
            </Button>
          ) : (
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={anyActionPending}
              onClick={() => runAction(resolve, conversation.id, 'Conversation resolved.')}
            >
              <Icons.circleCheck className='size-3.5' aria-hidden='true' />
              Resolve
            </Button>
          )}

          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='lg:hidden'
            onClick={onOpenCustomerDetails}
            aria-label='Show customer details'
          >
            <Icons.info className='size-4' />
          </Button>
        </div>
      </header>

      <Separator />

      <div
        ref={scrollRef}
        className='min-h-0 flex-1 space-y-4 overflow-y-auto p-3'
        aria-live='off'
        aria-label={`Message thread with ${conversation.displayName}`}
      >
        {messagesQuery.isPending && <MessageSkeleton />}

        {messagesQuery.isError && (
          <Empty className='h-full border-none'>
            <EmptyMedia variant='icon'>
              <Icons.alertCircle aria-hidden='true' />
            </EmptyMedia>
            <EmptyTitle>Could not load messages</EmptyTitle>
            <EmptyDescription>
              {messagesQuery.error instanceof Error
                ? messagesQuery.error.message
                : 'Please try again.'}
            </EmptyDescription>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => messagesQuery.refetch()}
            >
              <Icons.refresh className='size-3.5' aria-hidden='true' />
              Try again
            </Button>
          </Empty>
        )}

        {messagesQuery.data?.status === 'not_found' && (
          <Empty className='h-full border-none'>
            <EmptyMedia variant='icon'>
              <Icons.circleX aria-hidden='true' />
            </EmptyMedia>
            <EmptyTitle>Conversation not found</EmptyTitle>
            <EmptyDescription>This conversation may have been deleted.</EmptyDescription>
          </Empty>
        )}

        {messagesQuery.data?.status === 'ok' && messages.length === 0 && (
          <Empty className='h-full border-none'>
            <EmptyMedia variant='icon'>
              <Icons.chat aria-hidden='true' />
            </EmptyMedia>
            <EmptyTitle>No messages yet</EmptyTitle>
            <EmptyDescription>
              Messages will appear here once the conversation starts.
            </EmptyDescription>
          </Empty>
        )}

        {messages.map((message) => (
          <MessageItem key={message.id} message={message} />
        ))}
      </div>

      <Composer conversationName={conversation.displayName} />
    </Card>
  );
}
