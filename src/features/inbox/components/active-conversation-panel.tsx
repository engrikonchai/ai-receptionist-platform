'use client';

import { useEffect, useRef } from 'react';
import { Icons } from '@/components/icons';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useInboxStore } from '../utils/store';
import { CHANNEL_LABEL, LANGUAGE_LABEL } from '../utils/format';
import type { Conversation } from '../utils/types';
import { ChannelIcon } from './channel-icon';
import { ConversationStatusBadge } from './status-badge';
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

export function ActiveConversationPanel({
  conversation,
  className,
  onOpenCustomerDetails
}: {
  conversation: Conversation;
  className?: string;
  onOpenCustomerDetails: () => void;
}) {
  const draft = useInboxStore((state) => state.draft);
  const setDraft = useInboxStore((state) => state.setDraft);
  const sendMessage = useInboxStore((state) => state.sendMessage);
  const insertSuggestedReply = useInboxStore((state) => state.insertSuggestedReply);
  const takeOver = useInboxStore((state) => state.takeOver);
  const returnToAI = useInboxStore((state) => state.returnToAI);
  const setMobileView = useInboxStore((state) => state.setMobileView);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [conversation.id, conversation.messages.length]);

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
              {initialsFor(conversation.customer.name)}
            </AvatarFallback>
          </Avatar>
          <div className='min-w-0'>
            <p className='text-foreground truncate text-sm font-semibold'>
              {conversation.customer.name}
            </p>
            <div className='text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs'>
              <span className='inline-flex items-center gap-1'>
                <ChannelIcon channel={conversation.channel} />
                {CHANNEL_LABEL[conversation.channel]}
              </span>
              <span aria-hidden='true'>·</span>
              <span>{LANGUAGE_LABEL[conversation.language]}</span>
            </div>
          </div>
        </div>

        <div className='flex flex-wrap items-center gap-1.5'>
          <ConversationStatusBadge conversation={conversation} />
          {conversation.handledBy === 'ai' ? (
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => takeOver(conversation.id)}
            >
              <Icons.humanAgent className='size-3.5' aria-hidden='true' />
              Take over
            </Button>
          ) : (
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => returnToAI(conversation.id)}
            >
              <Icons.arrowBackUp className='size-3.5' aria-hidden='true' />
              Return to AI
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
        aria-label={`Message thread with ${conversation.customer.name}`}
      >
        {conversation.messages.map((message) => (
          <MessageItem key={message.id} message={message} />
        ))}
      </div>

      <Composer
        conversation={conversation}
        draft={draft}
        onDraftChange={setDraft}
        onSend={sendMessage}
        onSuggestedReply={insertSuggestedReply}
      />
    </Card>
  );
}
