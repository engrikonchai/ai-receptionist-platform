import { Icons } from '@/components/icons';
import { StatusPill } from '@/components/ui/status-pill';
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
    <StatusPill
      tone={isSettled ? 'neutral' : status === 'new' ? 'attention' : 'info'}
      className={className}
    >
      <Icon className='size-3' aria-hidden='true' />
      {label}
    </StatusPill>
  );
}
