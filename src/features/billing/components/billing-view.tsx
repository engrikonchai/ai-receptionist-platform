'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckoutEventNames, initializePaddle, type Paddle } from '@paddle/paddle-js';
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
  NO_PADDLE_CUSTOMER_MESSAGE,
  SESSION_EXPIRED_MESSAGE
} from '../api/types';
import { formatDate, formatMoney, SUBSCRIPTION_STATUS_LABEL } from '../utils/format';

const PAYMENT_PROBLEM_STATUSES = new Set(['past_due']);

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

  const [paddleInstance, setPaddleInstance] = useState<Paddle | null>(null);
  const [checkoutCompleted, setCheckoutCompleted] = useState(false);
  const environment = data?.status === 'ok' ? data.environment : null;

  // Paddle.js loads and opens the Checkout overlay entirely client-side
  // — the client token is deliberately public (see env.example.txt) and
  // can only ever open a checkout, never read or write account data.
  // The environment ('sandbox' here) comes from the server's own
  // validated PADDLE_ENVIRONMENT (src/lib/paddle/client.ts), never
  // guessed or hardcoded client-side.
  useEffect(() => {
    if (!environment) return;
    const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
    if (!token) return;

    let cancelled = false;
    void initializePaddle({
      token,
      environment,
      eventCallback: (event) => {
        // Purely a UX signal — never what grants subscription access.
        // The webhook handler (src/app/api/paddle/webhook/route.ts) is
        // the only authoritative source of truth; this just lets the
        // page show an immediate "thanks" and refetch the real status.
        if (event.name === CheckoutEventNames.CHECKOUT_COMPLETED) {
          setCheckoutCompleted(true);
          void refetch();
        }
      }
    }).then((instance) => {
      if (!cancelled) setPaddleInstance(instance ?? null);
    });

    return () => {
      cancelled = true;
    };
  }, [environment, refetch]);

  function handleStartCheckout() {
    checkoutMutation.mutate(undefined, {
      onSuccess: (result) => {
        if (result.status === 'ok') {
          if (!paddleInstance) {
            toast.error('Checkout is still loading. Please try again in a moment.');
            return;
          }
          paddleInstance.Checkout.open({ transactionId: result.transactionId });
          return;
        }
        if (result.status === 'already_subscribed') {
          toast.error(ALREADY_SUBSCRIBED_MESSAGE);
          return;
        }
        if (result.status === 'processing') {
          toast.success(
            'Your subscription is already being finalized — this page will update automatically.'
          );
          void refetch();
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
          toast.error(NO_PADDLE_CUSTOMER_MESSAGE);
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
          Paddle hasn&apos;t been configured for this environment yet. Contact support if you
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
      {checkoutCompleted && (
        <Alert>
          <Icons.toastSuccess aria-hidden='true' />
          <AlertTitle>Checkout complete</AlertTitle>
          <AlertDescription>
            Thanks — your subscription is being set up. This page will update automatically once
            Paddle confirms it.
          </AlertDescription>
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
          <div className='flex flex-wrap items-center gap-2'>
            <CardTitle>{plan?.productName ?? 'Subscription'}</CardTitle>
            {data.environment === 'sandbox' && (
              <Badge variant='secondary' aria-label='Paddle Sandbox / Test Mode'>
                Sandbox / Test Mode
              </Badge>
            )}
          </div>
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
              Start your subscription — a free trial may apply, decided automatically by Paddle.
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
                {checkoutMutation.isPending ? 'Starting…' : 'Start subscription'}
              </Button>
            )}
            {subscription?.hasPaddleCustomer && (
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
