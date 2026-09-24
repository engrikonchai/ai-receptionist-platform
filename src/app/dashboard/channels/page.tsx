import { cookies } from 'next/headers';
import Link from 'next/link';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status-pill';
import { Icons } from '@/components/icons';
import { ChannelIcon } from '@/features/inbox/components/channel-icon';
import {
  ACTIVE_BUSINESS_COOKIE,
  loadOwnerContext,
  resolveActiveBusinessId
} from '@/lib/supabase/owner-context';

const UPCOMING = [
  {
    channel: 'instagram',
    name: 'Instagram',
    description: 'Answer direct messages from your Instagram account.'
  },
  {
    channel: 'whatsapp',
    name: 'WhatsApp',
    description: 'Reply to customers who message your WhatsApp business number.'
  }
] as const;

export default async function ChannelsPage() {
  const ctx = await loadOwnerContext();

  let widgetEnabled: boolean | null = null;
  if (ctx.status === 'ok') {
    const cookieStore = await cookies();
    const activeBusinessId = resolveActiveBusinessId(
      ctx.businesses,
      cookieStore.get(ACTIVE_BUSINESS_COOKIE)?.value
    );
    if (activeBusinessId) {
      const { data } = await ctx.supabase
        .from('widget_settings')
        .select('widget_enabled')
        .eq('business_id', activeBusinessId)
        .maybeSingle();
      widgetEnabled = (data as { widget_enabled: boolean } | null)?.widget_enabled ?? null;
    }
  }

  return (
    <PageContainer
      pageTitle='Channels'
      pageDescription='Where your customers can reach the assistant. Every conversation lands in one Inbox.'
    >
      <div className='flex flex-col gap-8'>
        <section aria-labelledby='channels-active'>
          <h2
            id='channels-active'
            className='text-muted-foreground mb-3 text-[11px] font-extrabold tracking-[0.12em] uppercase'
          >
            Connected
          </h2>
          <div className='bg-card ring-foreground/10 flex flex-col gap-4 rounded-2xl p-5 ring-1 sm:flex-row sm:items-center sm:justify-between'>
            <div className='flex items-start gap-4'>
              <span className='bg-accent text-accent-foreground flex size-11 shrink-0 items-center justify-center rounded-xl'>
                <ChannelIcon channel='website' className='size-5' />
              </span>
              <div>
                <div className='flex flex-wrap items-center gap-2'>
                  <h3 className='text-foreground text-base font-bold'>Website chat</h3>
                  {widgetEnabled === null ? null : widgetEnabled ? (
                    <StatusPill tone='success' dot>
                      Live
                    </StatusPill>
                  ) : (
                    <StatusPill tone='attention'>Turned off</StatusPill>
                  )}
                </div>
                <p className='text-muted-foreground mt-1 max-w-md text-sm leading-relaxed'>
                  Visitors chat with your assistant through the widget on your site. Style it,
                  choose where it appears, and copy the install snippet.
                </p>
              </div>
            </div>
            <Button
              variant='outline'
              className='shrink-0 self-start sm:self-center'
              render={<Link href='/dashboard/widget' aria-label='Manage widget' />}
            >
              Manage widget
              <Icons.arrowRight className='size-4' aria-hidden='true' />
            </Button>
          </div>
        </section>

        <section aria-labelledby='channels-upcoming'>
          <h2
            id='channels-upcoming'
            className='text-muted-foreground mb-3 text-[11px] font-extrabold tracking-[0.12em] uppercase'
          >
            Not available yet
          </h2>
          <ul className='grid gap-3 sm:grid-cols-2'>
            {UPCOMING.map((item) => (
              <li
                key={item.channel}
                className='border-border flex items-start gap-4 rounded-2xl border border-dashed p-5'
              >
                <span className='bg-secondary text-muted-foreground flex size-11 shrink-0 items-center justify-center rounded-xl'>
                  <ChannelIcon channel={item.channel} className='size-5' />
                </span>
                <div className='min-w-0'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <h3 className='text-foreground text-base font-bold'>{item.name}</h3>
                    <StatusPill tone='neutral'>Not available yet</StatusPill>
                  </div>
                  <p className='text-muted-foreground mt-1 text-sm leading-relaxed'>
                    {item.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <p className='text-muted-foreground mt-4 text-sm'>
            These channels aren’t connected to your account yet. Nothing to set up for now.
          </p>
        </section>
      </div>
    </PageContainer>
  );
}
