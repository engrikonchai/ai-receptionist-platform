'use client';

import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { leadDetailsOptions, updateLeadStatusMutation } from '../api/queries';
import { LEAD_SOURCE_LABEL, LEAD_STATUS_LABEL, formatTimestamp } from '../utils/format';
import { useLeadsUiStore } from '../utils/store';
import type { LeadStatus } from '../api/types';
import { LeadHandoffBadge } from './handoff-badge';

const NOT_PROVIDED = 'Not provided';
const STATUS_OPTIONS: LeadStatus[] = ['new', 'contacted', 'confirmed', 'lost'];

function DetailRow({
  icon: Icon,
  label,
  value
}: {
  icon: (typeof Icons)[keyof typeof Icons];
  label: string;
  value: string;
}) {
  return (
    <div className='flex items-start gap-2.5 text-sm'>
      <Icon className='text-muted-foreground mt-0.5 size-4 shrink-0' aria-hidden='true' />
      <div className='min-w-0'>
        <p className='text-muted-foreground text-xs'>{label}</p>
        <p className='text-foreground wrap-break-word'>{value}</p>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className='space-y-2.5' aria-hidden='true'>
      <Skeleton className='h-4 w-24' />
      <Skeleton className='h-3.5 w-full' />
      <Skeleton className='h-3.5 w-full' />
      <Skeleton className='h-3.5 w-2/3' />
    </div>
  );
}

function LeadDetailsContent({ businessId, leadId }: { businessId: string; leadId: string }) {
  const { data, isPending, isError, refetch } = useQuery(leadDetailsOptions(businessId, leadId));
  const statusMutation = useMutation(updateLeadStatusMutation(businessId));

  if (isPending) return <DetailSkeleton />;
  if (isError) {
    return (
      <div className='space-y-2 text-sm'>
        <p className='text-muted-foreground'>We could not load this lead.</p>
        <Button type='button' variant='outline' size='sm' onClick={() => refetch()}>
          <Icons.refresh className='size-3.5' aria-hidden='true' />
          Try again
        </Button>
      </div>
    );
  }
  if (data.status === 'not_found') {
    return <p className='text-muted-foreground text-sm'>This lead is no longer available.</p>;
  }

  const { lead } = data;

  return (
    <div className='space-y-4 text-sm'>
      <div className='flex items-center justify-between gap-2'>
        <div className='min-w-0'>
          <p className='text-foreground text-base font-semibold'>
            {lead.name.trim() || 'Unnamed lead'}
          </p>
          <p className='text-muted-foreground text-xs'>{lead.reference}</p>
        </div>
        {lead.handoffStatus && (
          <LeadHandoffBadge status={lead.handoffStatus} humanTakeover={lead.humanTakeover} />
        )}
      </div>

      <Separator />

      <div className='space-y-1.5'>
        <p className='text-muted-foreground text-xs' id='lead-status-label'>
          Status
        </p>
        <Select
          value={lead.status}
          onValueChange={(value) => {
            if (!value || value === lead.status) return;
            statusMutation.mutate({ leadId: lead.id, status: value as LeadStatus });
          }}
          disabled={statusMutation.isPending}
        >
          <SelectTrigger aria-labelledby='lead-status-label' className='w-full sm:w-48'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((status) => (
              <SelectItem key={status} value={status}>
                {LEAD_STATUS_LABEL[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {statusMutation.isError && (
          <p className='text-destructive text-xs'>Could not update the status. Please try again.</p>
        )}
      </div>

      <Separator />

      <DetailRow icon={Icons.phone} label='Contact' value={lead.contact.trim() || NOT_PROVIDED} />
      <DetailRow icon={Icons.calendar} label='Check-in' value={lead.checkIn ?? NOT_PROVIDED} />
      <DetailRow icon={Icons.calendar} label='Check-out' value={lead.checkOut ?? NOT_PROVIDED} />
      <DetailRow
        icon={Icons.teams}
        label='Guests'
        value={lead.guestCount !== null ? String(lead.guestCount) : NOT_PROVIDED}
      />
      <DetailRow icon={Icons.pin} label='Source' value={LEAD_SOURCE_LABEL[lead.source]} />
      <DetailRow icon={Icons.chat} label='Language' value={lead.language} />
      <DetailRow icon={Icons.edit} label='Message' value={lead.note?.trim() || NOT_PROVIDED} />
      <DetailRow icon={Icons.clock} label='Received' value={formatTimestamp(lead.createdAt)} />

      {lead.conversationId && (
        <>
          <Separator />
          <Button
            type='button'
            variant='outline'
            className='w-full'
            render={
              <Link
                href={`/dashboard/inbox?conversation=${encodeURIComponent(lead.conversationId)}`}
                aria-label='Open the originating conversation in Inbox'
              />
            }
          >
            <Icons.externalLink className='size-4' aria-hidden='true' />
            Open in Inbox
          </Button>
        </>
      )}
    </div>
  );
}

export function LeadDetailsSheet({ businessId }: { businessId: string }) {
  const open = useLeadsUiStore((state) => state.sheetOpen);
  const setOpen = useLeadsUiStore((state) => state.setSheetOpen);
  const selectedLeadId = useLeadsUiStore((state) => state.selectedLeadId);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side='right' className='w-full overflow-y-auto p-4 sm:max-w-sm'>
        <SheetHeader className='p-0'>
          <SheetTitle>Lead details</SheetTitle>
        </SheetHeader>
        {selectedLeadId && <LeadDetailsContent businessId={businessId} leadId={selectedLeadId} />}
      </SheetContent>
    </Sheet>
  );
}
