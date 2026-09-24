import { Icons } from '@/components/icons';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { cn } from '@/lib/utils';
import { LEAD_SOURCE_LABEL, LEAD_STATUS_LABEL, formatTimestamp } from '../utils/format';
import type { LeadListItem, LeadStatus } from '../api/types';
import { LeadHandoffBadge } from './handoff-badge';

const LEAD_TONE: Record<LeadStatus, StatusTone> = {
  new: 'attention',
  contacted: 'info',
  confirmed: 'success',
  lost: 'neutral'
};

function initialsFor(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * One lead, laid out once: a two-line card on a phone (name + status
 * over contact + time) and a scannable table row from `md` up
 * (name · contact · source · status · received). The same five cells are
 * placed differently per breakpoint, so every value is in the DOM exactly
 * once. See LeadsView for the matching column header.
 */
export const LEAD_ROW_GRID =
  'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_5.5rem_13rem_6.5rem] md:items-center md:gap-4';

export function LeadRow({
  lead,
  onSelect
}: {
  lead: LeadListItem;
  onSelect: (id: string) => void;
}) {
  const isNew = lead.status === 'new';
  return (
    <button
      type='button'
      onClick={() => onSelect(lead.id)}
      aria-label={`Lead ${lead.displayName}`}
      className={cn(
        'focus-visible:ring-ring hover:bg-muted/70 active:bg-muted w-full touch-manipulation rounded-xl px-3 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none',
        LEAD_ROW_GRID
      )}
    >
      <span className='col-start-1 row-start-1 flex min-w-0 items-center gap-3 md:col-auto md:row-auto'>
        <span
          aria-hidden='true'
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-extrabold',
            isNew
              ? 'bg-status-attention-soft text-status-attention'
              : 'bg-secondary text-secondary-foreground'
          )}
        >
          {initialsFor(lead.displayName) || <Icons.user className='size-4' />}
        </span>
        <span className='min-w-0 flex-1'>
          <span className='text-foreground block truncate text-sm font-bold'>
            {lead.displayName}
          </span>
          <span className='text-muted-foreground hidden truncate text-xs md:block'>
            {lead.reference}
          </span>
        </span>
      </span>

      <span className='text-muted-foreground col-span-2 col-start-1 row-start-2 truncate pl-12 text-[13px] md:col-span-1 md:col-auto md:row-auto md:pl-0 md:text-sm'>
        {lead.maskedContact}
      </span>

      <span className='text-muted-foreground hidden text-sm md:block'>
        {LEAD_SOURCE_LABEL[lead.source]}
      </span>

      <span className='col-span-2 col-start-1 row-start-3 mt-1 flex flex-wrap items-center gap-1.5 pl-12 md:col-span-1 md:col-auto md:row-auto md:mt-0 md:pl-0'>
        <StatusPill tone={LEAD_TONE[lead.status]}>{LEAD_STATUS_LABEL[lead.status]}</StatusPill>
        {lead.handoffStatus && (
          <LeadHandoffBadge status={lead.handoffStatus} humanTakeover={lead.humanTakeover} />
        )}
      </span>

      <time
        suppressHydrationWarning
        dateTime={lead.createdAt}
        className='text-muted-foreground col-start-2 row-start-1 text-right text-xs tabular-nums md:col-auto md:row-auto'
      >
        {formatTimestamp(lead.createdAt)}
      </time>
    </button>
  );
}
