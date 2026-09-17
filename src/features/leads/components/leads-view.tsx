'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { leadsListOptions } from '../api/queries';
import { SESSION_EXPIRED_MESSAGE } from '../api/types';
import type { LeadListItem, LeadSource, LeadStatus } from '../api/types';
import { LEAD_SOURCE_LABEL, LEAD_STATUS_LABEL } from '../utils/format';
import { useLeadsUiStore } from '../utils/store';
import { LeadDetailsSheet } from './lead-details-sheet';
import { LeadRow } from './lead-row';

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
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
        <Card className='gap-1 px-4 py-3'>
          <CardContent className='p-0'>
            <p className='text-muted-foreground text-xs'>Total leads</p>
            <p className='text-foreground text-xl font-semibold'>{isPending ? '—' : stats.total}</p>
          </CardContent>
        </Card>
        <Card className='gap-1 px-4 py-3'>
          <CardContent className='p-0'>
            <p className='text-muted-foreground text-xs'>New</p>
            <p className='text-foreground text-xl font-semibold'>{isPending ? '—' : stats.new}</p>
          </CardContent>
        </Card>
        <Card className='gap-1 px-4 py-3'>
          <CardContent className='p-0'>
            <p className='text-muted-foreground text-xs'>Contacted</p>
            <p className='text-foreground text-xl font-semibold'>
              {isPending ? '—' : stats.contacted}
            </p>
          </CardContent>
        </Card>
        <Card className='gap-1 px-4 py-3'>
          <CardContent className='p-0'>
            <p className='text-muted-foreground text-xs'>Resolved</p>
            <p className='text-foreground text-xl font-semibold'>
              {isPending ? '—' : stats.resolved}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className='flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center'>
        <div className='relative flex-1 sm:min-w-56'>
          <Icons.search
            className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2'
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
            className='pl-8'
            disabled={stats.total === 0}
          />
        </div>

        <Select
          value={status}
          onValueChange={(value) => setStatus((value as StatusFilter) ?? 'all')}
        >
          <SelectTrigger className='w-full sm:w-44' aria-label='Filter by status'>
            <SelectValue placeholder='All statuses' />
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
            <SelectValue placeholder='All sources' />
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
        <div className='space-y-1' role='list' aria-label='Leads'>
          {filtered.map((lead) => (
            <div key={lead.id} role='listitem'>
              <LeadRow lead={lead} onSelect={openLead} />
            </div>
          ))}
        </div>
      )}

      <LeadDetailsSheet businessId={businessId} />
    </div>
  );
}
