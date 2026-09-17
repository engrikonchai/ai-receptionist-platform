import { Icons } from '@/components/icons';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { formatTimestamp, languageLabel } from '../utils/format';
import type { ConversationListItem } from '../api/types';
import { ChannelIcon } from './channel-icon';
import {
  ConversationStatusBadge,
  HandoffStatusIndicator,
  HumanTakeoverBadge
} from './status-badge';

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

  return (
    <button
      type='button'
      onClick={() => onSelect(conversation.id)}
      aria-current={isActive ? 'true' : undefined}
      aria-label={`Conversation with ${conversation.displayName}`}
      className={cn(
        'focus-visible:ring-ring focus-visible:ring-offset-background w-full rounded-lg border border-l-2 border-transparent px-2.5 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
        isActive ? 'border-l-primary bg-accent' : 'hover:bg-muted/60 border-l-transparent'
      )}
    >
      <div className='flex items-start gap-2.5'>
        <Avatar className='mt-0.5 shrink-0'>
          <AvatarFallback className='bg-primary/10 text-primary text-xs font-semibold'>
            {conversation.hasLeadName ? (
              initialsFor(conversation.displayName)
            ) : (
              <Icons.user className='size-4' aria-hidden='true' />
            )}
          </AvatarFallback>
        </Avatar>

        <div className='min-w-0 flex-1 space-y-1'>
          <div className='flex items-center justify-between gap-2'>
            <p className='text-foreground truncate text-sm font-semibold'>
              {conversation.displayName}
            </p>
            <span className='text-muted-foreground shrink-0 text-[0.7rem] tabular-nums'>
              {formatTimestamp(activityAt)}
            </span>
          </div>

          <p className='text-muted-foreground truncate text-xs'>
            {conversation.latestMessagePreview ?? 'No messages yet'}
          </p>

          <div className='flex flex-wrap items-center justify-between gap-1.5 pt-0.5'>
            <div className='text-muted-foreground flex min-w-0 items-center gap-2 text-[0.7rem]'>
              <ChannelIcon channel={conversation.channel} />
              <span className='truncate'>{languageLabel(conversation.detectedLanguage)}</span>
            </div>
            <div className='flex shrink-0 flex-wrap items-center justify-end gap-1.5'>
              {conversation.handoffStatus && (
                <HandoffStatusIndicator
                  status={conversation.handoffStatus}
                  humanTakeover={conversation.humanTakeover}
                />
              )}
              <HumanTakeoverBadge humanTakeover={conversation.humanTakeover} />
              <ConversationStatusBadge status={conversation.status} />
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
