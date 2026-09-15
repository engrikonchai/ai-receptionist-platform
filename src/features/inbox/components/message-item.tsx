import { Icons } from '@/components/icons';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Message, MessageAvatar, MessageContent, MessageHeader } from '@/components/ui/message';
import { cn } from '@/lib/utils';
import { formatTimestamp } from '../utils/format';
import type { ConversationMessage } from '../api/types';

function messageLabel(message: ConversationMessage): string {
  if (message.role === 'user') return 'Customer';
  if (message.role === 'system') return 'System';
  return message.senderType === 'human' ? 'Human operator' : 'AI Receptionist';
}

function RoleIcon({ message }: { message: ConversationMessage }) {
  if (message.role === 'system') return <Icons.info className='size-3.5' aria-hidden='true' />;
  if (message.role === 'assistant') {
    return message.senderType === 'human' ? (
      <Icons.humanAgent className='size-3.5' aria-hidden='true' />
    ) : (
      <Icons.aiAgent className='size-3.5' aria-hidden='true' />
    );
  }
  return <Icons.user className='size-3.5' aria-hidden='true' />;
}

function bubbleVariant(message: ConversationMessage): 'default' | 'tinted' | 'muted' {
  if (message.role !== 'assistant') return 'muted';
  return message.senderType === 'human' ? 'default' : 'tinted';
}

export function MessageItem({ message }: { message: ConversationMessage }) {
  if (message.role === 'system') {
    return (
      <div className='flex items-center justify-center gap-1.5 py-1' role='status'>
        <Icons.info className='text-muted-foreground size-3.5 shrink-0' aria-hidden='true' />
        <p className='text-muted-foreground text-center text-xs'>
          {message.content}
          <span className='ml-1.5'>· {formatTimestamp(message.createdAt)}</span>
        </p>
      </div>
    );
  }

  const isOutgoing = message.role === 'assistant';

  return (
    <Message align={isOutgoing ? 'end' : 'start'} className='items-end'>
      <MessageAvatar>
        <Avatar>
          <AvatarFallback
            className={cn(
              'text-xs font-semibold',
              isOutgoing ? 'bg-primary/15 text-primary' : 'bg-muted text-foreground'
            )}
          >
            <RoleIcon message={message} />
          </AvatarFallback>
        </Avatar>
      </MessageAvatar>
      <MessageContent>
        <MessageHeader className={cn('gap-1.5', isOutgoing && 'justify-end')}>
          <span className='font-medium'>{messageLabel(message)}</span>
          <span aria-hidden='true'>·</span>
          <span>{formatTimestamp(message.createdAt)}</span>
        </MessageHeader>
        <Bubble variant={bubbleVariant(message)} align={isOutgoing ? 'end' : 'start'}>
          <BubbleContent>{message.content}</BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
}
