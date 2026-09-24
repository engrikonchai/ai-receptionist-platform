'use client';

import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { Icons } from '@/components/icons';
import { StatusPill } from '@/components/ui/status-pill';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
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

/** Renders an email/phone as a real link so the owner can act on it in one tap. */
function ContactValue({ value }: { value: string }) {
  const trimmed = value.trim();
  if (!trimmed) return <span className='text-muted-foreground'>{NOT_PROVIDED}</span>;
  const href = trimmed.includes('@')
    ? `mailto:${trimmed}`
    : /^[+\d][\d\s().-]{5,}$/.test(trimmed)
      ? `tel:${trimmed.replace(/[^\d+]/g, '')}`
      : null;
  return href ? (
    <a
      href={href}
      className='text-accent-foreground font-semibold underline-offset-4 hover:underline'
    >
      {trimmed}
    </a>
  ) : (
    <span>{trimmed}</span>
  );
}

function DetailRow({
  label,
  value,
  children
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className='grid grid-cols-[5.5rem_1fr] gap-x-3 text-sm'>
      <dt className='text-muted-foreground pt-px text-xs font-semibold'>{label}</dt>
      <dd className='text-foreground min-w-0 wrap-break-word'>
        {children ?? value ?? NOT_PROVIDED}
      </dd>
    </div>
  );
}

function SectionHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className='mb-3 flex items-center justify-between gap-2'>
      <h3 className='text-muted-foreground text-[11px] font-extrabold tracking-[0.12em] uppercase'>
        {title}
      </h3>
      {children}
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
  const hasDates = Boolean(lead.checkIn || lead.checkOut);

  return (
    <section>
      <SectionHeading title='Lead'>
        <StatusPill
          tone={
            lead.status === 'new' ? 'attention' : lead.status === 'lost' ? 'neutral' : 'success'
          }
        >
          {LEAD_STATUS_LABEL[lead.status]}
        </StatusPill>
      </SectionHeading>
      <dl className='space-y-2.5'>
        <DetailRow label='Name' value={lead.name.trim() || NOT_PROVIDED} />
        <DetailRow label='Contact'>
          <ContactValue value={lead.contact} />
        </DetailRow>
        {lead.note?.trim() && <DetailRow label='Note' value={lead.note.trim()} />}
        {lead.guestCount !== null && (
          <DetailRow label='Party size' value={String(lead.guestCount)} />
        )}
        {hasDates && (
          <DetailRow
            label='Dates'
            value={[lead.checkIn, lead.checkOut].filter(Boolean).join(' → ')}
          />
        )}
        <DetailRow
          label='Source'
          value={`${CHANNEL_LABEL[lead.source]} · ${languageLabel(lead.language)}`}
        />
      </dl>
    </section>
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
    <section>
      <SectionHeading title='Handoff'>
        <StatusPill tone={isSettled ? 'neutral' : handoff.status === 'new' ? 'attention' : 'info'}>
          {handoffStatusIndicatorLabel(handoff.status, humanTakeover)}
        </StatusPill>
      </SectionHeading>
      {handoff.question?.trim() && (
        <p className='bg-secondary text-foreground mb-3 rounded-xl px-3 py-2.5 text-sm leading-relaxed'>
          &ldquo;{handoff.question.trim()}&rdquo;
        </p>
      )}
      <dl className='space-y-2.5'>
        <DetailRow label='Customer' value={handoff.customerName?.trim() || NOT_PROVIDED} />
        <DetailRow label='Contact'>
          <ContactValue value={handoff.contact} />
        </DetailRow>
        <DetailRow label='Reason' value={humanizeReason(handoff.reason)} />
      </dl>
    </section>
  );
}

function humanizeReason(reason: string | null): string {
  const trimmed = reason?.trim();
  if (!trimmed) return NOT_PROVIDED;
  const text = trimmed.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function CustomerDetailsContent({
  businessId,
  conversation
}: {
  businessId: string;
  conversation: ConversationListItem;
}) {
  return (
    <div className='space-y-6 text-sm'>
      <div>
        <p className='text-foreground text-lg leading-tight font-bold'>
          {conversation.displayName}
        </p>
        <p className='text-muted-foreground mt-0.5 text-xs'>{conversation.maskedVisitorId}</p>
      </div>

      <LeadSection businessId={businessId} conversationId={conversation.id} />

      <HandoffSection
        businessId={businessId}
        conversationId={conversation.id}
        humanTakeover={conversation.humanTakeover}
      />

      <section>
        <SectionHeading title='Internal notes' />
        <Textarea
          placeholder='Add an internal note (not visible to the customer)'
          rows={2}
          disabled
          className='min-h-16 text-sm'
        />
        <p className='text-muted-foreground mt-2 text-xs'>
          Internal notes will be enabled in a future update.
        </p>
      </section>
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
        <h2 className='text-foreground text-sm font-bold'>Customer details</h2>
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
