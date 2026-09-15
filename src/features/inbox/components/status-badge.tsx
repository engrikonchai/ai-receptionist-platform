import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Conversation } from '../utils/types';

/**
 * A single status badge for a conversation: "Needs attention" takes
 * priority (it's the actionable state), then "Resolved", otherwise who
 * is currently handling it (AI Agent / Human Operator). Always pairs an
 * icon with a text label so the state never relies on colour alone.
 */
export function ConversationStatusBadge({
  conversation,
  className
}: {
  conversation: Conversation;
  className?: string;
}) {
  if (conversation.status === 'needs_attention') {
    return (
      <Badge variant='destructive' className={cn('gap-1 border-destructive/20', className)}>
        <Icons.warning className='size-3' aria-hidden='true' />
        Needs attention
      </Badge>
    );
  }

  if (conversation.status === 'resolved') {
    return (
      <Badge variant='outline' className={cn('text-muted-foreground gap-1', className)}>
        <Icons.circleCheck className='size-3' aria-hidden='true' />
        Resolved
      </Badge>
    );
  }

  if (conversation.handledBy === 'human') {
    return (
      <Badge variant='secondary' className={cn('gap-1', className)}>
        <Icons.humanAgent className='size-3' aria-hidden='true' />
        Human
      </Badge>
    );
  }

  return (
    <Badge variant='outline' className={cn('text-primary border-primary/30 gap-1', className)}>
      <Icons.aiAgent className='size-3' aria-hidden='true' />
      AI
    </Badge>
  );
}
