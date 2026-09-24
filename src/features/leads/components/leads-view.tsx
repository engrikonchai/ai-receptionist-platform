'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { leadsListOptions } from '../api/queries';
import { SESSION_EXPIRED_MESSAGE } from '../api/types';
import type { LeadListItem, LeadSource, LeadStatus } from '../api/types';
import { LEAD_SOURCE_LABEL, LEAD_STATUS_LABEL } from '../utils/format';
import { useLeadsUiStore } from '../utils/store';
import { LeadDetailsSheet } from './lead-details-sheet';
import { LEAD_ROW_GRID, LeadRow } from './lead-row';

type StatusFilter = 'all' | LeadStatus;
type SourceFilter = 'all' | LeadSource;

const STATUS_OPTIONS: StatusFilter[] = ['all', 'new', 'contacted', 'confirmed', 'lost'];
const SOURCE_OPTIONS: SourceFilter[] = ['all', 'website', 'instagram', 'whatsapp'];

function matchesSearch(lead: LeadListItem, query: string): boolean {
  if (!query) return true;
  return [lead.displayName, lead.reference].join(' ').toLowerCase().includes(query);
}

function LeadsListSkeleton() {
  return (
    <div className='space-y-2' aria-hidden='true'>
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className='flex items-start gap-2.5 rounded-lg p-2.5'>
          <Skeleton className='size-8 shrink-0 rounded-full' />
          <div className='min-w-0 flex-1 space-y-2'>
            <Skeleton className='h-3.5 w-2/3' />
            <Skeleton className='h-3 w-1/3' />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LeadsView({ businessId }: { businessId: string }) {
  const {
    data: leads,
    isPending,
    isError,
    error,
    refetch
  } = useQuery(leadsListOptions(businessId));
  const openLead = useLeadsUiStore((state) => state.openLead);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [source, setSource] = useState<SourceFilter>('all');

  const stats = useMemo(() => {
    const rows = leads ?? [];
    return {
      total: rows.length,
      new: rows.filter((row) => row.status === 'new').length,
      contacted: rows.filter((row) => row.status === 'contacted').length,
      resolved: rows.filter((row) => row.status === 'confirmed' || row.status === 'lost').length
    };
  }, [leads]);

  const filtered = useMemo(() => {
    if (!leads) return [];
    const query = search.trim().toLowerCase();
    return leads.filter((lead) => {
      if (status !== 'all' && lead.status !== status) return false;
      if (source !== 'all' && lead.source !== source) return false;
      return matchesSearch(lead, query);
    });
  }, [leads, search, status, source]);

  const hasActiveFilters = search.trim().length > 0 || status !== 'all' || source !== 'all';

  if (isError) {
    const message = error instanceof Error ? error.message : 'Please try again.';
    const sessionExpired = message === SESSION_EXPIRED_MESSAGE;

    return (
      <Empty className='mt-6'>
        <EmptyMedia variant='icon'>
          <Icons.alertCircle aria-hidden='true' />
        </EmptyMedia>
        <EmptyTitle>{sessionExpired ? 'Session expired' : 'Could not load leads'}</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
        <EmptyContent>
          {sessionExpired ? (
            <Button
              render={<Link href='/login?next=/dashboard/leads' aria-label='Sign in again' />}
            >
              Sign in again
            </Button>
          ) : (
            <Button type='button' variant='outline' onClick={() => refetch()}>
              <Icons.refresh className='size-4' aria-hidden='true' />
              Try again
            </Button>
          )}
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='bg-card ring-foreground/10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl ring-1 sm:grid-cols-4 [&>div]:bg-card'>
        {[
          { label: 'Total leads', value: stats.total, tone: '' },
          { label: 'New', value: stats.new, tone: stats.new > 0 ? 'text-status-attention' : '' },
          { label: 'Contacted', value: stats.contacted, tone: '' },
          { label: 'Resolved', value: stats.resolved, tone: '' }
        ].map((stat) => (
          <div key={stat.label} className='px-5 py-4'>
            <p className='text-muted-foreground text-xs font-semibold'>{stat.label}</p>
            <p
              className={cn(
                'font-display mt-1 text-[30px] leading-none font-semibold tabular-nums',
                stat.tone
              )}
            >
              {isPending ? '—' : stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className='flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center'>
        <div className='relative flex-1 sm:min-w-56'>
          <Icons.search
            className='text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2'
            aria-hidden='true'
          />
          <label htmlFor='leads-search' className='sr-only'>
            Search leads
          </label>
          <Input
            id='leads-search'
            type='search'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='Search by name or reference'
            className='bg-card h-10 pl-9'
            disabled={stats.total === 0}
          />
        </div>

        <Select
          value={status}
          onValueChange={(value) => setStatus((value as StatusFilter) ?? 'all')}
        >
          <SelectTrigger className='w-full sm:w-44' aria-label='Filter by status'>
            <SelectValue placeholder='All statuses'>
              {status === 'all' ? 'All statuses' : LEAD_STATUS_LABEL[status]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((value) => (
              <SelectItem key={value} value={value}>
                {value === 'all' ? 'All statuses' : LEAD_STATUS_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={source}
          onValueChange={(value) => setSource((value as SourceFilter) ?? 'all')}
        >
          <SelectTrigger className='w-full sm:w-44' aria-label='Filter by source'>
            <SelectValue placeholder='All sources'>
              {source === 'all' ? 'All sources' : LEAD_SOURCE_LABEL[source]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SOURCE_OPTIONS.map((value) => (
              <SelectItem key={value} value={value}>
                {value === 'all' ? 'All sources' : LEAD_SOURCE_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isPending && <LeadsListSkeleton />}

      {!isPending && stats.total === 0 && (
        <Empty className='mt-6'>
          <EmptyMedia variant='icon'>
            <Icons.leads aria-hidden='true' />
          </EmptyMedia>
          <EmptyTitle>No leads yet</EmptyTitle>
          <EmptyDescription>
            Leads appear here automatically when a visitor uses "Talk to a person" in your chat
            widget.
          </EmptyDescription>
        </Empty>
      )}

      {!isPending && stats.total > 0 && filtered.length === 0 && (
        <Empty className='mt-6'>
          <EmptyMedia variant='icon'>
            <Icons.search aria-hidden='true' />
          </EmptyMedia>
          <EmptyTitle>No results</EmptyTitle>
          <EmptyDescription>
            {hasActiveFilters
              ? 'Try a different search term or clear your filters.'
              : 'No leads match the current view.'}
          </EmptyDescription>
          {hasActiveFilters && (
            <EmptyContent>
              <Button
                type='button'
                variant='outline'
                onClick={() => {
                  setSearch('');
                  setStatus('all');
                  setSource('all');
                }}
              >
                Clear filters
              </Button>
            </EmptyContent>
          )}
        </Empty>
      )}

      {!isPending && filtered.length > 0 && (
        <div className='bg-card ring-foreground/10 rounded-2xl p-2 ring-1'>
          <div
            aria-hidden='true'
            className={cn(
              'text-muted-foreground px-3 pt-2 pb-2 text-[11px] font-extrabold tracking-[0.1em] uppercase max-md:hidden',
              LEAD_ROW_GRID
            )}
          >
            <span>Lead</span>
            <span>Contact</span>
            <span>Source</span>
            <span>Status</span>
            <span className='text-right'>Received</span>
          </div>
          <div className='divide-border divide-y md:border-t' role='list' aria-label='Leads'>
            {filtered.map((lead) => (
              <div key={lead.id} role='listitem' className='py-0.5'>
                <LeadRow lead={lead} onSelect={openLead} />
              </div>
            ))}
          </div>
        </div>
      )}

      <LeadDetailsSheet businessId={businessId} />
    </div>
  );
}
