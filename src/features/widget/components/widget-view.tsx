'use client';

import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Icons } from '@/components/icons';
import { Skeleton } from '@/components/ui/skeleton';
import { widgetSettingsOptions } from '../api/queries';
import { SESSION_EXPIRED_MESSAGE } from '../api/types';
import { WidgetSettingsForm } from './widget-settings-form';

function WidgetSkeleton() {
  return (
    <div className='grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]' aria-hidden='true'>
      <div className='space-y-6'>
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
      <Card>
        <CardContent className='pt-6'>
          <Skeleton className='h-80 w-full' />
        </CardContent>
      </Card>
    </div>
  );
}

export function WidgetView({ businessId, siteOrigin }: { businessId: string; siteOrigin: string }) {
  const { data, isPending, isError, error, refetch } = useQuery(widgetSettingsOptions(businessId));

  if (isPending) return <WidgetSkeleton />;

  if (isError) {
    const message = error instanceof Error ? error.message : 'Please try again.';
    const sessionExpired = message === SESSION_EXPIRED_MESSAGE;

    return (
      <Empty>
        <EmptyMedia variant='icon'>
          <Icons.alertCircle aria-hidden='true' />
        </EmptyMedia>
        <EmptyTitle>
          {sessionExpired ? 'Session expired' : 'Widget settings unavailable'}
        </EmptyTitle>
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

  return (
    <WidgetSettingsForm
      businessId={businessId}
      defaultLanguage={data.defaultLanguage}
      settings={data.settings}
      siteOrigin={siteOrigin}
    />
  );
}
