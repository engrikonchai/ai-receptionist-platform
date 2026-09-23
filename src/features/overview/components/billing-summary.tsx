import Link from 'next/link';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SUBSCRIPTION_STATUS_LABEL, formatDate } from '@/features/billing/utils/format';
import type { BusinessSubscriptionRow } from '@/lib/supabase/database.types';

type Subscription = Pick<
  BusinessSubscriptionRow,
  'status' | 'trial_end' | 'current_period_end' | 'cancel_at_period_end'
>;

/**
 * "Billing summary" — Overview content spec: preserve the real existing
 * billing status and Manage Billing behavior; no invented plan, price,
 * or usage data. Every string here is either a fixed label already
 * used pre-redesign or a real subscription field — nothing new added.
 */
export function BillingSummary({ subscription }: { subscription: Subscription | null }) {
  const hasPaymentProblem = subscription?.status === 'past_due';

  return (
    <Card className='shadow-sm'>
      <CardContent className='flex flex-col gap-3'>
        <div className='flex items-center justify-between gap-2'>
          <h3 className='text-foreground text-sm font-bold'>Billing</h3>
          {subscription && (
            <Badge variant={hasPaymentProblem ? 'destructive' : 'outline'}>
              {SUBSCRIPTION_STATUS_LABEL[subscription.status]}
            </Badge>
          )}
        </div>

        {hasPaymentProblem && (
          <p className='text-destructive text-sm font-medium'>
            There&apos;s a problem with your last payment.
          </p>
        )}

        {subscription ? (
          <>
            {subscription.status === 'trialing' && subscription.trial_end && (
              <p className='text-muted-foreground text-sm'>
                Trial ends {formatDate(subscription.trial_end)}.
              </p>
            )}
            {subscription.current_period_end && !hasPaymentProblem && (
              <p className='text-muted-foreground text-sm'>
                {subscription.cancel_at_period_end ? 'Access ends' : 'Renews'}{' '}
                {formatDate(subscription.current_period_end)}.
              </p>
            )}
          </>
        ) : (
          <p className='text-muted-foreground text-sm'>
            Start your subscription to keep using the AI receptionist.
          </p>
        )}

        <Button
          size='sm'
          variant='outline'
          className='mt-1 self-start'
          render={<Link href='/dashboard/billing' aria-label='Manage billing' />}
        >
          <Icons.billing className='size-4' aria-hidden='true' />
          {subscription ? 'Manage billing' : 'View billing'}
        </Button>
      </CardContent>
    </Card>
  );
}
