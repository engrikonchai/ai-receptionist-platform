import { Icons } from '@/components/icons';
import { Card, CardContent } from '@/components/ui/card';
import { MetricTile } from './metric-tile';
import { pluralize } from '../utils/pluralize';

/**
 * "Operational summary" — Overview content spec: real new-lead count,
 * real pending-handoff count, clear links to Leads/Inbox, purposeful
 * status colors, useful zero states. Only these two metrics are shown
 * because they're the only ones this page already loads — no
 * conversation-volume/response-time/other metric exists to show here
 * (see docs/daylight-design-system.md "Overview" section).
 */
export function OperationalSummary({
  newLeadCount,
  pendingHandoffCount,
  hasError
}: {
  newLeadCount: number;
  pendingHandoffCount: number;
  hasError: boolean;
}) {
  if (hasError) {
    return (
      <Card className='shadow-sm'>
        <CardContent className='flex items-center gap-2'>
          <Icons.alertCircle className='text-muted-foreground size-4 shrink-0' aria-hidden='true' />
          <p className='text-muted-foreground text-sm'>
            We couldn&apos;t load your leads and handoffs right now. Refresh the page to try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  const nothingPending = newLeadCount === 0 && pendingHandoffCount === 0;

  return (
    <section aria-label='Operational summary' className='flex flex-col gap-3'>
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
        <MetricTile
          icon={Icons.leads}
          label='New leads'
          value={newLeadCount}
          href='/dashboard/leads'
          hrefLabel={`${newLeadCount} ${pluralize(newLeadCount, 'new lead')} — view leads`}
          hint={newLeadCount === 0 ? 'None waiting right now' : undefined}
        />
        <MetricTile
          icon={Icons.humanAgent}
          label='Pending handoffs'
          value={pendingHandoffCount}
          href='/dashboard/inbox'
          hrefLabel={`${pendingHandoffCount} pending ${pluralize(pendingHandoffCount, 'handoff')} — view inbox`}
          hint={pendingHandoffCount === 0 ? 'Nothing awaiting a reply' : 'Awaiting a reply'}
          attention={pendingHandoffCount > 0}
        />
      </div>
      {nothingPending && (
        <p className='text-muted-foreground text-xs'>
          Nothing needs attention yet — new leads and &quot;Talk to a person&quot; requests from
          your chat widget will show up here.
        </p>
      )}
    </section>
  );
}
