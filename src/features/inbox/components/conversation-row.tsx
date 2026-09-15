import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { LANGUAGE_LABEL } from '../utils/format';
import type { Conversation } from '../utils/types';
import { ChannelIcon } from './channel-icon';
import { ConversationStatusBadge } from './status-badge';

function initialsFor(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function ConversationRow({
  conversation,
  isActive,
  onSelect
}: {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (id: string) => void;
}) {
  const lastMessage = conversation.messages[conversation.messages.length - 1];

  return (
    <button
      type='button'
      onClick={() => onSelect(conversation.id)}
      aria-current={isActive ? 'true' : undefined}
      aria-label={`Conversation with ${conversation.customer.name}`}
      className={cn(
        'focus-visible:ring-ring focus-visible:ring-offset-background w-full rounded-lg border border-l-2 border-transparent px-2.5 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
        isActive ? 'border-l-primary bg-accent' : 'hover:bg-muted/60 border-l-transparent'
      )}
    >
      <div className='flex items-start gap-2.5'>
        <Avatar className='mt-0.5 shrink-0'>
          <AvatarFallback className='bg-primary/10 text-primary text-xs font-semibold'>
            {initialsFor(conversation.customer.name)}
          </AvatarFallback>
        </Avatar>

        <div className='min-w-0 flex-1 space-y-1'>
          <div className='flex items-center justify-between gap-2'>
            <p className='text-foreground truncate text-sm font-semibold'>
              {conversation.customer.name}
            </p>
            <span className='text-muted-foreground shrink-0 text-[0.7rem] tabular-nums'>
              {lastMessage?.timestamp}
            </span>
          </div>

          <p className='text-muted-foreground truncate text-xs'>
            {lastMessage ? `${lastMessage.author}: ${lastMessage.text}` : 'No messages yet'}
          </p>

          <div className='flex flex-wrap items-center justify-between gap-1.5 pt-0.5'>
            <div className='text-muted-foreground flex min-w-0 items-center gap-2 text-[0.7rem]'>
              <ChannelIcon channel={conversation.channel} />
              <span className='truncate'>{LANGUAGE_LABEL[conversation.language]}</span>
            </div>
            <div className='flex shrink-0 items-center gap-1.5'>
              {conversation.unreadCount > 0 && (
                <span
                  className='bg-primary text-primary-foreground inline-flex min-h-5 min-w-5 items-center justify-center rounded-full px-1 text-[0.65rem] font-semibold'
                  aria-label={`${conversation.unreadCount} unread messages`}
                >
                  {conversation.unreadCount}
                </span>
              )}
              <ConversationStatusBadge conversation={conversation} />
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
