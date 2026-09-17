'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useQueryState } from 'nuqs';
import { toast } from 'sonner';
import { Icons } from '@/components/icons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import {
  billingStatusOptions,
  openCustomerPortalMutation,
  startCheckoutMutation
} from '../api/queries';
import {
  ALREADY_SUBSCRIBED_MESSAGE,
  NO_STRIPE_CUSTOMER_MESSAGE,
  SESSION_EXPIRED_MESSAGE
} from '../api/types';
import { formatDate, formatMoney, SUBSCRIPTION_STATUS_LABEL } from '../utils/format';

const PAYMENT_PROBLEM_STATUSES = new Set(['past_due', 'unpaid']);

function BillingSkeleton() {
  return (
    <Card aria-hidden='true'>
      <CardHeader>
        <Skeleton className='h-5 w-32' />
      </CardHeader>
      <CardContent className='space-y-3'>
        <Skeleton className='h-4 w-full' />
        <Skeleton className='h-4 w-2/3' />
        <Skeleton className='h-9 w-40' />
      </CardContent>
    </Card>
  );
}

export function BillingView({ businessId }: { businessId: string }) {
  const { data, isPending, isError, error, refetch } = useQuery(billingStatusOptions(businessId));
  const checkoutMutation = useMutation(startCheckoutMutation(businessId));
  const portalMutation = useMutation(openCustomerPortalMutation(businessId));

  const [checkoutParam, setCheckoutParam] = useQueryState('checkout');
  const [dismissedBanner, setDismissedBanner] = useState<'success' | 'canceled' | null>(null);

  useEffect(() => {
    if (checkoutParam === 'success' || checkoutParam === 'canceled') {
      setDismissedBanner(checkoutParam);
      void setCheckoutParam(null);
    }
  }, [checkoutParam, setCheckoutParam]);

  function handleStartCheckout() {
    checkoutMutation.mutate(undefined, {
      onSuccess: (result) => {
        if (result.status === 'ok') {
          window.location.href = result.url;
          return;
        }
        if (result.status === 'already_subscribed') {
          toast.error(ALREADY_SUBSCRIBED_MESSAGE);
          return;
        }
        if (result.status === 'not_configured') {
          toast.error('Billing is not configured yet.');
          return;
        }
        toast.error(result.error);
      },
      onError: () => toast.error('Something went wrong. Please try again.')
    });
  }

  function handleOpenPortal() {
    portalMutation.mutate(undefined, {
      onSuccess: (result) => {
        if (result.status === 'ok') {
          window.location.href = result.url;
          return;
        }
        if (result.status === 'no_customer') {
          toast.error(NO_STRIPE_CUSTOMER_MESSAGE);
          return;
        }
        if (result.status === 'not_configured') {
          toast.error('Billing is not configured yet.');
          return;
        }
        toast.error(result.error);
      },
      onError: () => toast.error('Something went wrong. Please try again.')
    });
  }

  if (isPending) return <BillingSkeleton />;

  if (isError) {
    const message = error instanceof Error ? error.message : 'Please try again.';
    const sessionExpired = message === SESSION_EXPIRED_MESSAGE;

    return (
      <Empty className='mt-6'>
        <EmptyMedia variant='icon'>
          <Icons.alertCircle aria-hidden='true' />
        </EmptyMedia>
        <EmptyTitle>{sessionExpired ? 'Session expired' : 'Could not load billing'}</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
        <EmptyContent>
          {sessionExpired ? (
            <Button
              render={<Link href='/login?next=/dashboard/billing' aria-label='Sign in again' />}
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

  if (data.status === 'not_configured') {
    return (
      <Empty className='mt-6'>
        <EmptyMedia variant='icon'>
          <Icons.billing aria-hidden='true' />
        </EmptyMedia>
        <EmptyTitle>Billing isn&apos;t set up yet</EmptyTitle>
        <EmptyDescription>
          Stripe hasn&apos;t been configured for this environment yet. Contact support if you
          expected billing to be available.
        </EmptyDescription>
      </Empty>
    );
  }

  const { plan, subscription } = data;
  const hasPaymentProblem = subscription
    ? PAYMENT_PROBLEM_STATUSES.has(subscription.status)
    : false;

  return (
    <div className='space-y-4'>
      {dismissedBanner === 'success' && (
        <Alert>
          <Icons.toastSuccess aria-hidden='true' />
          <AlertTitle>Checkout complete</AlertTitle>
          <AlertDescription>
            Thanks — your subscription is being set up. This page will update automatically once
            Stripe confirms it.
          </AlertDescription>
        </Alert>
      )}
      {dismissedBanner === 'canceled' && (
        <Alert variant='destructive'>
          <Icons.alertCircle aria-hidden='true' />
          <AlertTitle>Checkout canceled</AlertTitle>
          <AlertDescription>No changes were made. You can start again any time.</AlertDescription>
        </Alert>
      )}

      {hasPaymentProblem && (
        <Alert variant='destructive'>
          <Icons.alertCircle aria-hidden='true' />
          <AlertTitle>There&apos;s a problem with your payment</AlertTitle>
          <AlertDescription>
            We couldn&apos;t process your last payment. Update your payment method to keep your
            subscription active.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className='flex flex-row items-center justify-between gap-2'>
          <CardTitle>{plan?.productName ?? 'Subscription'}</CardTitle>
          {subscription && (
            <Badge variant={hasPaymentProblem ? 'destructive' : 'outline'}>
              {SUBSCRIPTION_STATUS_LABEL[subscription.status]}
            </Badge>
          )}
        </CardHeader>
        <CardContent className='space-y-4'>
          {plan?.unitAmount !== null && plan?.unitAmount !== undefined && (
            <p className='text-foreground text-2xl font-semibold'>
              {formatMoney(plan.unitAmount, plan.currency)}
              <span className='text-muted-foreground text-sm font-normal'>
                {' '}
                / {plan.interval ?? 'month'}
              </span>
            </p>
          )}

          {!subscription && (
            <p className='text-muted-foreground text-sm'>
              Start a 14-day free trial — no charge until the trial ends.
            </p>
          )}

          {subscription?.status === 'trialing' && subscription.trialEnd && (
            <p className='text-muted-foreground text-sm'>
              Trial ends {formatDate(subscription.trialEnd)}.
            </p>
          )}

          {subscription?.currentPeriodEnd && (
            <p className='text-muted-foreground text-sm'>
              {subscription.cancelAtPeriodEnd ? 'Access ends' : 'Renews'}{' '}
              {formatDate(subscription.currentPeriodEnd)}.
            </p>
          )}

          {subscription?.cancelAtPeriodEnd && (
            <p className='text-muted-foreground text-sm'>
              Your subscription is set to cancel at the end of the current period.
            </p>
          )}

          <div className='flex flex-wrap gap-2 pt-1'>
            {!subscription && (
              <Button
                type='button'
                onClick={handleStartCheckout}
                disabled={checkoutMutation.isPending}
              >
                {checkoutMutation.isPending ? 'Starting…' : 'Start free trial'}
              </Button>
            )}
            {subscription?.hasStripeCustomer && (
              <Button
                type='button'
                variant='outline'
                onClick={handleOpenPortal}
                disabled={portalMutation.isPending}
              >
                {portalMutation.isPending ? 'Opening…' : 'Manage billing'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
