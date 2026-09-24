'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { knowledgeItemsOptions } from '../api/queries';
import type { KnowledgeItem } from '../api/types';
import { useKnowledgeUiStore } from '../utils/store';
import { DeleteKnowledgeDialog } from './delete-knowledge-dialog';
import { KnowledgeItemCard } from './knowledge-item-card';
import { KnowledgeItemSheet } from './knowledge-item-sheet';

type StatusFilter = 'all' | 'active' | 'inactive';
const ALL_CATEGORIES = '__all__';

function matchesSearch(item: KnowledgeItem, query: string): boolean {
  if (!query) return true;
  const haystack = [item.category, item.question, item.answerEn, item.answerMe, item.answerRu]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function KnowledgeListSkeleton() {
  return (
    <div className='space-y-3' aria-hidden='true'>
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index} className='gap-3 rounded-2xl p-5'>
          <Skeleton className='h-4 w-24' />
          <Skeleton className='h-5 w-2/3' />
          <Skeleton className='h-4 w-1/3' />
        </Card>
      ))}
    </div>
  );
}

export function KnowledgeView({
  businessId,
  defaultLanguage,
  supportedLanguages
}: {
  businessId: string;
  defaultLanguage: string;
  supportedLanguages: string[];
}) {
  const {
    data: items,
    isPending,
    isError,
    error,
    refetch
  } = useQuery(knowledgeItemsOptions(businessId));

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>(ALL_CATEGORIES);
  const [status, setStatus] = useState<StatusFilter>('all');

  const categories = useMemo(() => {
    const set = new Set((items ?? []).map((item) => item.category));
    return Array.from(set).toSorted((a, b) => a.localeCompare(b));
  }, [items]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (category !== ALL_CATEGORIES && item.category !== category) return false;
      if (status === 'active' && !item.isActive) return false;
      if (status === 'inactive' && item.isActive) return false;
      return matchesSearch(item, query);
    });
  }, [items, search, category, status]);

  const totalCount = items?.length ?? 0;
  const activeCount = useMemo(() => (items ?? []).filter((item) => item.isActive).length, [items]);
  const hasActiveFilters =
    search.trim().length > 0 || category !== ALL_CATEGORIES || status !== 'all';

  if (isError) {
    const message = error instanceof Error ? error.message : 'Please try again.';
    return (
      <Empty className='mt-6'>
        <EmptyMedia variant='icon'>
          <Icons.alertCircle aria-hidden='true' />
        </EmptyMedia>
        <EmptyTitle>Could not load the knowledge base</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
        <EmptyContent>
          <Button type='button' variant='outline' onClick={() => refetch()}>
            <Icons.refresh className='size-4' aria-hidden='true' />
            Try again
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='bg-card ring-foreground/10 grid max-w-md grid-cols-2 gap-px overflow-hidden rounded-2xl ring-1 [&>div]:bg-card'>
        <div className='px-5 py-4'>
          <p className='text-muted-foreground text-xs font-semibold'>Total items</p>
          <p className='font-display mt-1 text-[30px] leading-none font-semibold tabular-nums'>
            {isPending ? '—' : totalCount}
          </p>
        </div>
        <div className='px-5 py-4'>
          <p className='text-muted-foreground text-xs font-semibold'>Active items</p>
          <p className='font-display text-status-success mt-1 text-[30px] leading-none font-semibold tabular-nums'>
            {isPending ? '—' : activeCount}
          </p>
        </div>
      </div>

      <div className='flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center'>
        <div className='relative flex-1 sm:min-w-56'>
          <Icons.search
            className='text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2'
            aria-hidden='true'
          />
          <label htmlFor='knowledge-search' className='sr-only'>
            Search knowledge base
          </label>
          <Input
            id='knowledge-search'
            type='search'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='Search questions and answers'
            className='bg-card h-10 pl-9'
            disabled={totalCount === 0}
          />
        </div>

        <Select value={category} onValueChange={(value) => setCategory(value ?? ALL_CATEGORIES)}>
          <SelectTrigger className='w-full sm:w-48' aria-label='Filter by category'>
            <SelectValue placeholder='All categories'>
              {category === ALL_CATEGORIES ? 'All categories' : category}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
            {categories.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div
          role='group'
          aria-label='Filter by status'
          className='bg-secondary flex items-center gap-0.5 rounded-lg p-0.5'
        >
          {(
            [
              { value: 'all', label: 'All' },
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' }
            ] as const
          ).map((filter) => (
            <button
              key={filter.value}
              type='button'
              aria-pressed={status === filter.value}
              onClick={() => setStatus(filter.value)}
              className={`focus-visible:ring-ring min-h-9 flex-1 touch-manipulation rounded-md px-3 text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:outline-none ${
                status === filter.value
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {isPending && <KnowledgeListSkeleton />}

      {!isPending && totalCount === 0 && (
        <Empty className='mt-6'>
          <EmptyMedia variant='icon'>
            <Icons.knowledge aria-hidden='true' />
          </EmptyMedia>
          <EmptyTitle>No knowledge yet</EmptyTitle>
          <EmptyDescription>
            Add your first question and answer so the AI receptionist can start using it.
          </EmptyDescription>
          <EmptyContent>
            <Button type='button' onClick={() => useKnowledgeUiStore.getState().openCreateSheet()}>
              <Icons.add className='size-4' aria-hidden='true' />
              Add knowledge
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {!isPending && totalCount > 0 && filtered.length === 0 && (
        <Empty className='mt-6'>
          <EmptyMedia variant='icon'>
            <Icons.search aria-hidden='true' />
          </EmptyMedia>
          <EmptyTitle>No results</EmptyTitle>
          <EmptyDescription>
            {hasActiveFilters
              ? 'Try a different search term or clear your filters.'
              : 'No knowledge items match the current view.'}
          </EmptyDescription>
          {hasActiveFilters && (
            <EmptyContent>
              <Button
                type='button'
                variant='outline'
                onClick={() => {
                  setSearch('');
                  setCategory(ALL_CATEGORIES);
                  setStatus('all');
                }}
              >
                Clear filters
              </Button>
            </EmptyContent>
          )}
        </Empty>
      )}

      {!isPending && filtered.length > 0 && (
        <div className='space-y-3' role='list' aria-label='Knowledge items'>
          {filtered.map((item) => (
            <div key={item.id} role='listitem'>
              <KnowledgeItemCard businessId={businessId} item={item} />
            </div>
          ))}
        </div>
      )}

      <KnowledgeItemSheet
        businessId={businessId}
        defaultLanguage={defaultLanguage}
        supportedLanguages={supportedLanguages}
      />
      <DeleteKnowledgeDialog businessId={businessId} />
    </div>
  );
}
