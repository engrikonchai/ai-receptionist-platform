import { Icons } from '@/components/icons';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Message, MessageAvatar, MessageContent, MessageHeader } from '@/components/ui/message';
import { cn } from '@/lib/utils';
import { formatTimestamp } from '../utils/format';
import type { ConversationMessage } from '../api/types';

const ROLE_LABEL: Record<ConversationMessage['role'], string> = {
  user: 'Customer',
  assistant: 'AI Receptionist',
  system: 'System'
};

function RoleIcon({ role }: { role: ConversationMessage['role'] }) {
  if (role === 'assistant') return <Icons.aiAgent className='size-3.5' aria-hidden='true' />;
  if (role === 'system') return <Icons.info className='size-3.5' aria-hidden='true' />;
  return <Icons.user className='size-3.5' aria-hidden='true' />;
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
            <RoleIcon role={message.role} />
          </AvatarFallback>
        </Avatar>
      </MessageAvatar>
      <MessageContent>
        <MessageHeader className={cn('gap-1.5', isOutgoing && 'justify-end')}>
          <span className='font-medium'>{ROLE_LABEL[message.role]}</span>
          <span aria-hidden='true'>·</span>
          <span>{formatTimestamp(message.createdAt)}</span>
        </MessageHeader>
        <Bubble variant={isOutgoing ? 'tinted' : 'muted'} align={isOutgoing ? 'end' : 'start'}>
          <BubbleContent>{message.content}</BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
}
