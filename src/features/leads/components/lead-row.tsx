import { Icons } from '@/components/icons';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { LEAD_SOURCE_LABEL, LEAD_STATUS_LABEL, formatTimestamp } from '../utils/format';
import type { LeadListItem } from '../api/types';
import { LeadHandoffBadge } from './handoff-badge';

function initialsFor(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function LeadRow({
  lead,
  onSelect
}: {
  lead: LeadListItem;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type='button'
      onClick={() => onSelect(lead.id)}
      aria-label={`Lead ${lead.displayName}`}
      className={cn(
        'focus-visible:ring-ring focus-visible:ring-offset-background hover:bg-muted/60 w-full rounded-lg border border-transparent px-2.5 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'
      )}
    >
      <div className='flex items-start gap-2.5'>
        <Avatar className='mt-0.5 shrink-0'>
          <AvatarFallback className='bg-primary/10 text-primary text-xs font-semibold'>
            {initialsFor(lead.displayName) || <Icons.user className='size-4' aria-hidden='true' />}
          </AvatarFallback>
        </Avatar>

        <div className='min-w-0 flex-1 space-y-1'>
          <div className='flex items-center justify-between gap-2'>
            <p className='text-foreground truncate text-sm font-semibold'>{lead.displayName}</p>
            <span className='text-muted-foreground shrink-0 text-[0.7rem] tabular-nums'>
              {formatTimestamp(lead.createdAt)}
            </span>
          </div>

          <p className='text-muted-foreground truncate text-xs'>{lead.maskedContact}</p>

          <div className='flex flex-wrap items-center justify-between gap-1.5 pt-0.5'>
            <span className='text-muted-foreground text-[0.7rem]'>
              {LEAD_SOURCE_LABEL[lead.source]}
            </span>
            <div className='flex min-w-0 flex-wrap items-center justify-end gap-1.5'>
              {lead.handoffStatus && (
                <LeadHandoffBadge status={lead.handoffStatus} humanTakeover={lead.humanTakeover} />
              )}
              <Badge variant='outline'>{LEAD_STATUS_LABEL[lead.status]}</Badge>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
