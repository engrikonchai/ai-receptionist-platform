import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { handoffStatusIndicatorLabel } from '../utils/format';
import type { HandoffStatus } from '../api/types';

/**
 * Only rendered when the lead's originating conversation has a
 * `handoffs` row. Mirrors HandoffStatusIndicator in
 * src/features/inbox/components/status-badge.tsx — duplicated per this
 * app's per-feature convention rather than imported cross-feature.
 */
export function LeadHandoffBadge({
  status,
  humanTakeover,
  className
}: {
  status: HandoffStatus;
  humanTakeover: boolean;
  className?: string;
}) {
  const label = handoffStatusIndicatorLabel(status, humanTakeover);
  const isSettled = status === 'resolved' || (status === 'contacted' && !humanTakeover);
  const Icon =
    status === 'new' ? Icons.warning : status === 'resolved' ? Icons.circleCheck : Icons.humanAgent;

  return (
    <Badge
      variant={isSettled ? 'outline' : status === 'new' ? 'destructive' : 'secondary'}
      className={cn('gap-1', isSettled && 'text-muted-foreground', className)}
    >
      <Icon className='size-3' aria-hidden='true' />
      {label}
    </Badge>
  );
}
