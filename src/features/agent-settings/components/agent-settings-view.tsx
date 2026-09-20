'use client';

import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Icons } from '@/components/icons';
import { Skeleton } from '@/components/ui/skeleton';
import { agentSettingsOptions } from '../api/queries';
import { SESSION_EXPIRED_MESSAGE } from '../api/types';
import { AgentSettingsForm } from './agent-settings-form';

function AgentSettingsSkeleton() {
  return (
    <div className='space-y-6' aria-hidden='true'>
      {Array.from({ length: 3 }).map((_, index) => (
        <Card key={index}>
          <CardHeader>
            <Skeleton className='h-5 w-32' />
          </CardHeader>
          <CardContent className='space-y-3'>
            <Skeleton className='h-9 w-full' />
            <Skeleton className='h-9 w-2/3' />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function AgentSettingsView({ businessId }: { businessId: string }) {
  const { data, isPending, isError, error, refetch } = useQuery(agentSettingsOptions(businessId));

  if (isPending) return <AgentSettingsSkeleton />;

  if (isError) {
    const message = error instanceof Error ? error.message : 'Please try again.';
    const sessionExpired = message === SESSION_EXPIRED_MESSAGE;

    return (
      <Empty>
        <EmptyMedia variant='icon'>
          <Icons.alertCircle aria-hidden='true' />
        </EmptyMedia>
        <EmptyTitle>{sessionExpired ? 'Session expired' : 'Agent settings unavailable'}</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
        {!sessionExpired && (
          <Button type='button' variant='outline' onClick={() => refetch()}>
            <Icons.refresh className='size-4' aria-hidden='true' />
            Try again
          </Button>
        )}
      </Empty>
    );
  }

  return <AgentSettingsForm businessId={businessId} settings={data} />;
}
