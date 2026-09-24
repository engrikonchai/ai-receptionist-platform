'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, type UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useInboxStore } from '../utils/store';
import { CHANNEL_LABEL, handoffStatusIndicatorLabel, languageLabel } from '../utils/format';
import {
  conversationMessagesOptions,
  reopenConversationMutation,
  resolveConversationMutation,
  returnToAIMutation,
  takeOverMutation
} from '../api/queries';
import type { ConversationActionResult, ConversationListItem } from '../api/types';
import { ChannelIcon } from './channel-icon';
import { ConversationStateBadge } from './status-badge';
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

function isNewDay(previousIso: string | undefined, currentIso: string): boolean {
  if (!previousIso) return true;
  return new Date(previousIso).toDateString() !== new Date(currentIso).toDateString();
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
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
  successMessage: string,
  onSuccess?: () => void
) {
  mutation.mutate(conversationId, {
    onSuccess: (result) => {
      if (result.success) {
        toast.success(successMessage);
        onSuccess?.();
      } else {
        toast.error(result.error);
      }
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
  const [composerFocusSignal, setComposerFocusSignal] = useState(0);

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
      <header className='flex flex-col gap-3 border-b p-3 sm:px-4'>
        <div className='flex min-w-0 items-center gap-2.5'>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='-ml-1 size-10 md:hidden'
            onClick={() => setMobileView('list')}
            aria-label='Back to conversation list'
          >
            <Icons.arrowLeft className='size-5' />
          </Button>
          <span
            aria-hidden='true'
            className='bg-secondary text-secondary-foreground flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-extrabold'
          >
            {conversation.hasLeadName ? (
              initialsFor(conversation.displayName)
            ) : (
              <Icons.user className='size-4' />
            )}
          </span>
          <div className='min-w-0 flex-1'>
            <div className='flex min-w-0 items-center gap-2'>
              <h2 className='text-foreground truncate text-base leading-tight font-bold'>
                {conversation.displayName}
              </h2>
              <ConversationStateBadge conversation={conversation} />
            </div>
            <div className='text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs'>
              <span className='inline-flex items-center gap-1'>
                <ChannelIcon channel={conversation.channel} />
                {CHANNEL_LABEL[conversation.channel]}
              </span>
              <span aria-hidden='true'>·</span>
              <span>{languageLabel(conversation.detectedLanguage)}</span>
              {conversation.handoffStatus && (
                <>
                  <span aria-hidden='true'>·</span>
                  <span>
                    {handoffStatusIndicatorLabel(
                      conversation.handoffStatus,
                      conversation.humanTakeover
                    )}
                  </span>
                </>
              )}
            </div>
          </div>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='size-10 shrink-0 lg:hidden'
            onClick={onOpenCustomerDetails}
            aria-label='Show customer details'
          >
            <Icons.info className='size-5' />
          </Button>
        </div>

        <div className='flex items-center gap-2 max-sm:[&>button]:flex-1'>
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
              size='sm'
              disabled={anyActionPending}
              onClick={() =>
                runAction(takeOver, conversation.id, 'You took over this conversation.', () =>
                  setComposerFocusSignal((signal) => signal + 1)
                )
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
        </div>
      </header>

      <div
        ref={scrollRef}
        className='bg-background/60 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 sm:p-5'
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

        {messages.map((message, index) => (
          <div key={message.id} className='space-y-3'>
            {isNewDay(messages[index - 1]?.createdAt, message.createdAt) && (
              <div className='flex items-center gap-3 py-1' role='separator'>
                <span className='bg-border h-px flex-1' />
                <span className='text-muted-foreground text-[11px] font-bold tracking-wide uppercase'>
                  {dayLabel(message.createdAt)}
                </span>
                <span className='bg-border h-px flex-1' />
              </div>
            )}
            <MessageItem message={message} />
          </div>
        ))}
      </div>

      <Composer
        businessId={businessId}
        conversationId={conversation.id}
        conversationName={conversation.displayName}
        canSend={conversation.humanTakeover && conversation.status !== 'closed'}
        disabledReason={
          conversation.status === 'closed'
            ? 'Reopen this conversation to send a reply.'
            : 'Take over this conversation to send a reply — the AI receptionist is currently handling it.'
        }
        focusSignal={composerFocusSignal}
      />
    </Card>
  );
}
