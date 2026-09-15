import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { HANDOFF_STATUS_LABEL } from '../utils/format';
import type { ConversationStatus, HandoffStatus } from '../api/types';

/** Conversation lifecycle: open, handed off, or closed. Always pairs an icon with a text label. */
export function ConversationStatusBadge({
  status,
  className
}: {
  status: ConversationStatus;
  className?: string;
}) {
  if (status === 'handed_off') {
    return (
      <Badge variant='destructive' className={cn('gap-1 border-destructive/20', className)}>
        <Icons.warning className='size-3' aria-hidden='true' />
        Handed off
      </Badge>
    );
  }

  if (status === 'closed') {
    return (
      <Badge variant='outline' className={cn('text-muted-foreground gap-1', className)}>
        <Icons.circleCheck className='size-3' aria-hidden='true' />
        Closed
      </Badge>
    );
  }

  return (
    <Badge variant='outline' className={cn('text-primary border-primary/30 gap-1', className)}>
      <Icons.circle className='size-3' aria-hidden='true' />
      Open
    </Badge>
  );
}

/** Who currently owns replying: the AI receptionist, or a human operator who took over. */
export function HumanTakeoverBadge({
  humanTakeover,
  className
}: {
  humanTakeover: boolean;
  className?: string;
}) {
  if (humanTakeover) {
    return (
      <Badge variant='secondary' className={cn('gap-1', className)}>
        <Icons.humanAgent className='size-3' aria-hidden='true' />
        Human
      </Badge>
    );
  }

  return (
    <Badge variant='outline' className={cn('text-muted-foreground gap-1', className)}>
      <Icons.aiAgent className='size-3' aria-hidden='true' />
      AI
    </Badge>
  );
}

/** Only rendered when a `handoffs` row exists for the conversation. */
export function HandoffStatusIndicator({
  status,
  className
}: {
  status: HandoffStatus;
  className?: string;
}) {
  return (
    <Badge
      variant={status === 'resolved' ? 'outline' : 'destructive'}
      className={cn('gap-1', status === 'resolved' && 'text-muted-foreground', className)}
    >
      <Icons.humanAgent className='size-3' aria-hidden='true' />
      Handoff {HANDOFF_STATUS_LABEL[status].toLowerCase()}
    </Badge>
  );
}
