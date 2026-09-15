import { Icons } from '@/components/icons';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Message, MessageAvatar, MessageContent, MessageHeader } from '@/components/ui/message';
import { cn } from '@/lib/utils';
import type { Message as MessageType } from '../utils/types';

function SenderIcon({ sender }: { sender: MessageType['sender'] }) {
  if (sender === 'ai') return <Icons.aiAgent className='size-3.5' aria-hidden='true' />;
  if (sender === 'human') return <Icons.humanAgent className='size-3.5' aria-hidden='true' />;
  return <Icons.user className='size-3.5' aria-hidden='true' />;
}

export function MessageItem({ message }: { message: MessageType }) {
  if (message.sender === 'system') {
    return (
      <div className='flex items-center justify-center gap-1.5 py-1' role='status'>
        <Icons.info className='text-muted-foreground size-3.5 shrink-0' aria-hidden='true' />
        <p className='text-muted-foreground text-center text-xs'>
          {message.text}
          <span className='ml-1.5'>· {message.timestamp}</span>
        </p>
      </div>
    );
  }

  const isOutgoing = message.sender === 'ai' || message.sender === 'human';
  const variant =
    message.sender === 'human' ? 'default' : message.sender === 'ai' ? 'tinted' : 'muted';

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
            <SenderIcon sender={message.sender} />
          </AvatarFallback>
        </Avatar>
      </MessageAvatar>
      <MessageContent>
        <MessageHeader className={cn('gap-1.5', isOutgoing && 'justify-end')}>
          <span className='font-medium'>{message.author}</span>
          <span aria-hidden='true'>·</span>
          <span>{message.timestamp}</span>
        </MessageHeader>
        <Bubble variant={variant} align={isOutgoing ? 'end' : 'start'}>
          <BubbleContent>{message.text}</BubbleContent>
        </Bubble>
        {message.lowConfidence && (
          <div
            role='status'
            className={cn(
              'border-destructive/30 bg-muted flex max-w-[85%] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs',
              isOutgoing ? 'self-end' : 'self-start'
            )}
          >
            <Icons.warning
              className='text-destructive mt-0.5 size-3.5 shrink-0'
              aria-hidden='true'
            />
            <p className='text-foreground'>
              <span className='font-medium'>Needs human review</span> — confidence{' '}
              {message.lowConfidence.confidence}%. {message.lowConfidence.reason}
            </p>
          </div>
        )}
      </MessageContent>
    </Message>
  );
}
