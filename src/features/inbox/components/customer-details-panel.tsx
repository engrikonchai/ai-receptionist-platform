'use client';

import { useQuery } from '@tanstack/react-query';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useInboxStore } from '../utils/store';
import {
  CHANNEL_LABEL,
  LEAD_STATUS_LABEL,
  handoffStatusIndicatorLabel,
  languageLabel
} from '../utils/format';
import { conversationHandoffOptions, conversationLeadOptions } from '../api/queries';
import type { ConversationListItem } from '../api/types';

const NOT_PROVIDED = 'Not provided';

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

function SectionSkeleton() {
  return (
    <div className='space-y-2.5' aria-hidden='true'>
      <Skeleton className='h-4 w-20' />
      <Skeleton className='h-3.5 w-full' />
      <Skeleton className='h-3.5 w-full' />
      <Skeleton className='h-3.5 w-2/3' />
    </div>
  );
}

function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className='space-y-2 text-sm'>
      <p className='text-muted-foreground'>{message}</p>
      <Button type='button' variant='outline' size='sm' onClick={onRetry}>
        <Icons.refresh className='size-3.5' aria-hidden='true' />
        Try again
      </Button>
    </div>
  );
}

function LeadSection({
  businessId,
  conversationId
}: {
  businessId: string;
  conversationId: string;
}) {
  const { data, isPending, isError, refetch } = useQuery(
    conversationLeadOptions(businessId, conversationId)
  );

  if (isPending) return <SectionSkeleton />;
  if (isError) {
    return <SectionError message='We could not load lead details.' onRetry={() => refetch()} />;
  }
  if (data.status === 'not_found') {
    return (
      <p className='text-muted-foreground text-sm'>No lead captured for this conversation yet.</p>
    );
  }

  const { lead } = data;

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between gap-2'>
        <p className='text-foreground text-sm font-medium'>Lead</p>
        <Badge variant='secondary'>{LEAD_STATUS_LABEL[lead.status]}</Badge>
      </div>
      <DetailRow icon={Icons.user} label='Name' value={lead.name.trim() || NOT_PROVIDED} />
      <DetailRow icon={Icons.phone} label='Contact' value={lead.contact.trim() || NOT_PROVIDED} />
      <DetailRow icon={Icons.calendar} label='Check-in' value={lead.checkIn ?? NOT_PROVIDED} />
      <DetailRow icon={Icons.calendar} label='Check-out' value={lead.checkOut ?? NOT_PROVIDED} />
      <DetailRow
        icon={Icons.teams}
        label='Guests'
        value={lead.guestCount !== null ? String(lead.guestCount) : NOT_PROVIDED}
      />
      <DetailRow icon={Icons.pin} label='Source' value={CHANNEL_LABEL[lead.source]} />
      <DetailRow icon={Icons.chat} label='Language' value={languageLabel(lead.language)} />
      <DetailRow icon={Icons.edit} label='Note' value={lead.note?.trim() || NOT_PROVIDED} />
    </div>
  );
}

function HandoffSection({
  businessId,
  conversationId,
  humanTakeover
}: {
  businessId: string;
  conversationId: string;
  humanTakeover: boolean;
}) {
  const { data, isPending, isError, refetch } = useQuery(
    conversationHandoffOptions(businessId, conversationId)
  );

  if (isPending) return <SectionSkeleton />;
  if (isError) {
    return <SectionError message='We could not load handoff details.' onRetry={() => refetch()} />;
  }
  if (data.status === 'not_found') {
    return (
      <p className='text-muted-foreground text-sm'>No handoff requested for this conversation.</p>
    );
  }

  const { handoff } = data;
  const isSettled =
    handoff.status === 'resolved' || (handoff.status === 'contacted' && !humanTakeover);

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between gap-2'>
        <p className='text-foreground text-sm font-medium'>Handoff</p>
        <Badge variant={isSettled ? 'outline' : 'destructive'}>
          {handoffStatusIndicatorLabel(handoff.status, humanTakeover)}
        </Badge>
      </div>
      <DetailRow
        icon={Icons.user}
        label='Customer name'
        value={handoff.customerName?.trim() || NOT_PROVIDED}
      />
      <DetailRow
        icon={Icons.phone}
        label='Contact'
        value={handoff.contact.trim() || NOT_PROVIDED}
      />
      <DetailRow
        icon={Icons.chat}
        label='Question'
        value={handoff.question?.trim() || NOT_PROVIDED}
      />
      <DetailRow icon={Icons.info} label='Reason' value={handoff.reason?.trim() || NOT_PROVIDED} />
    </div>
  );
}

export function CustomerDetailsContent({
  businessId,
  conversation
}: {
  businessId: string;
  conversation: ConversationListItem;
}) {
  return (
    <div className='space-y-4 text-sm'>
      <div>
        <p className='text-foreground text-base font-semibold'>{conversation.displayName}</p>
        <p className='text-muted-foreground text-xs'>{conversation.maskedVisitorId}</p>
      </div>

      <Separator />

      <LeadSection businessId={businessId} conversationId={conversation.id} />

      <Separator />

      <HandoffSection
        businessId={businessId}
        conversationId={conversation.id}
        humanTakeover={conversation.humanTakeover}
      />

      <Separator />

      <div>
        <p className='text-foreground mb-1.5 text-sm font-medium'>Internal notes</p>
        <p className='text-muted-foreground mb-2 text-xs'>
          Internal notes will be enabled in a future update.
        </p>
        <Textarea
          placeholder='Add an internal note (not visible to the guest)'
          rows={2}
          disabled
          className='min-h-16 text-sm'
        />
        <Tooltip>
          <TooltipTrigger
            render={<Button type='button' size='sm' variant='outline' disabled className='mt-2' />}
          >
            <Icons.add className='size-3.5' aria-hidden='true' />
            Add note
          </TooltipTrigger>
          <TooltipContent>Internal notes will be enabled in a future update</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

export function CustomerDetailsPanel({
  businessId,
  conversation,
  className
}: {
  businessId: string;
  conversation: ConversationListItem;
  className?: string;
}) {
  const collapsed = useInboxStore((state) => state.customerPanelCollapsed);
  const setCollapsed = useInboxStore((state) => state.setCustomerPanelCollapsed);

  if (collapsed) {
    return (
      <Card
        className={cn(
          'hidden h-full min-h-0 w-10 flex-col items-center gap-0 overflow-hidden p-0 lg:flex',
          className
        )}
      >
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className='m-1.5'
          onClick={() => setCollapsed(false)}
          aria-label='Show customer details'
        >
          <Icons.chevronsLeft className='size-4' />
        </Button>
      </Card>
    );
  }

  return (
    <Card
      className={cn('hidden h-full min-h-0 flex-col gap-0 overflow-hidden p-0 lg:flex', className)}
    >
      <div className='flex items-center justify-between border-b p-3'>
        <h2 className='text-foreground text-sm font-semibold'>Customer details</h2>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          onClick={() => setCollapsed(true)}
          aria-label='Collapse customer details'
        >
          <Icons.chevronsRight className='size-4' />
        </Button>
      </div>
      <div className='min-h-0 flex-1 overflow-y-auto p-3'>
        <CustomerDetailsContent businessId={businessId} conversation={conversation} />
      </div>
    </Card>
  );
}
