import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import {
  conversationAttention,
  formatRelativeShort,
  formatTimestamp,
  languageLabel
} from '../utils/format';
import type { ConversationListItem } from '../api/types';
import { ChannelIcon } from './channel-icon';
import { ConversationStateBadge } from './status-badge';

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
  conversation: ConversationListItem;
  isActive: boolean;
  onSelect: (id: string) => void;
}) {
  const activityAt = conversation.latestMessageAt ?? conversation.updatedAt;
  const needsYou = conversationAttention(conversation) === 'needs_you';
  const closed = conversation.status === 'closed';

  return (
    <button
      type='button'
      onClick={() => onSelect(conversation.id)}
      aria-current={isActive ? 'true' : undefined}
      aria-label={`Conversation with ${conversation.displayName}`}
      className={cn(
        'focus-visible:ring-ring relative flex w-full touch-manipulation gap-3 rounded-xl px-3 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none',
        isActive ? 'bg-accent' : 'hover:bg-muted/70 active:bg-muted'
      )}
    >
      {needsYou && (
        <span
          aria-hidden='true'
          className='bg-status-attention absolute inset-y-3 left-0 w-1 rounded-r-full'
        />
      )}
      <span
        aria-hidden='true'
        className={cn(
          'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-extrabold',
          needsYou
            ? 'bg-status-attention-soft text-status-attention'
            : 'bg-secondary text-secondary-foreground'
        )}
      >
        {conversation.hasLeadName ? (
          initialsFor(conversation.displayName)
        ) : (
          <Icons.user className='size-4' />
        )}
      </span>

      <span className='min-w-0 flex-1'>
        <span className='flex items-baseline justify-between gap-2'>
          <span
            className={cn(
              'text-foreground truncate text-sm',
              closed ? 'text-muted-foreground font-semibold' : 'font-bold'
            )}
          >
            {conversation.displayName}
          </span>
          <time
            dateTime={activityAt}
            title={formatTimestamp(activityAt)}
            suppressHydrationWarning
            className={cn(
              'shrink-0 text-xs tabular-nums',
              needsYou ? 'text-status-attention font-bold' : 'text-muted-foreground'
            )}
          >
            {formatRelativeShort(activityAt)}
          </time>
        </span>
        <span className='text-muted-foreground mt-0.5 line-clamp-2 block text-[13px] leading-snug'>
          {conversation.latestMessagePreview ?? 'No messages yet'}
        </span>
        <span className='mt-2 flex flex-wrap items-center gap-x-2 gap-y-1'>
          <ConversationStateBadge conversation={conversation} />
          {conversation.channel !== 'website' && (
            <span className='text-muted-foreground inline-flex items-center gap-1 text-xs'>
              <ChannelIcon channel={conversation.channel} />
            </span>
          )}
          {conversation.detectedLanguage !== 'en' && (
            <span className='text-muted-foreground text-xs'>
              {languageLabel(conversation.detectedLanguage)}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
