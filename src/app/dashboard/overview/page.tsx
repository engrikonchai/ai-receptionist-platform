import Link from 'next/link';
import { cookies } from 'next/headers';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import { PlaceholderPage } from '@/components/layout/placeholder-page';
import {
  ACTIVE_BUSINESS_COOKIE,
  loadOwnerContext,
  resolveActiveBusinessId
} from '@/lib/supabase/owner-context';
import type { WidgetSettingsRow } from '@/lib/supabase/database.types';
import { SetupChecklist } from '@/features/onboarding/components/setup-checklist';
import { computeSetupProgress } from '@/features/onboarding/utils/setup-progress';

export default async function OverviewPage() {
  const ctx = await loadOwnerContext();

  // dashboard/layout.tsx already enforces auth + onboarding-completed +
  // profile/business presence for every /dashboard/* route before this
  // page ever renders, so `ctx.status` is always 'ok' here in practice.
  // This fallback only guards against that invariant somehow not
  // holding, without inventing a redirect loop of its own.
  if (ctx.status !== 'ok') {
    return (
      <PlaceholderPage
        title='Overview'
        description='A snapshot of your AI receptionist activity.'
      />
    );
  }

  const cookieStore = await cookies();
  const activeBusinessId = resolveActiveBusinessId(
    ctx.businesses,
    cookieStore.get(ACTIVE_BUSINESS_COOKIE)?.value
  );
  const activeBusiness = ctx.businesses.find((b) => b.id === activeBusinessId) ?? null;

  const displayName = ctx.profile.display_name?.trim() || ctx.user.email || 'there';

  // The setup checklist always follows the ACTIVE business — an owner
  // with more than one business sees each one's own completion state,
  // never a stale or mixed-up one, because this reads fresh on every
  // request from whichever business the cookie/fallback above resolved.
  // The leads/handoffs counts below follow it the same way, and track
  // their own `error` (unlike the two counts above) so a failed fetch
  // can render as an explicit "could not load" state rather than
  // silently looking like zero — see the Leads & handoffs card below.
  const [
    { data: widgetSettingsRow },
    { count: activeKnowledgeItemCount },
    { count: newLeadCount, error: newLeadCountError },
    { count: pendingHandoffCount, error: pendingHandoffCountError }
  ] = activeBusiness
    ? await Promise.all([
        ctx.supabase
          .from('widget_settings')
          .select('*')
          .eq('business_id', activeBusiness.id)
          .maybeSingle(),
        ctx.supabase
          .from('knowledge_items')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', activeBusiness.id)
          .eq('is_active', true),
        ctx.supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', activeBusiness.id)
          .eq('status', 'new'),
        ctx.supabase
          .from('handoffs')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', activeBusiness.id)
          .eq('status', 'new')
      ])
    : [{ data: null }, { count: 0 }, { count: 0, error: null }, { count: 0, error: null }];

  const widget = widgetSettingsRow as WidgetSettingsRow | null;

  const setupProgress = activeBusiness
    ? computeSetupProgress({
        business: activeBusiness,
        widget: {
          widget_enabled: widget?.widget_enabled ?? false,
          title: widget?.title ?? '',
          welcome_message_en: widget?.welcome_message_en ?? null,
          welcome_message_me: widget?.welcome_message_me ?? null,
          welcome_message_ru: widget?.welcome_message_ru ?? null,
          allowed_origins: widget?.allowed_origins ?? [],
          installation_confirmed: widget?.installation_confirmed ?? false
        },
        activeKnowledgeItemCount: activeKnowledgeItemCount ?? 0
      })
    : null;

  return (
    <PageContainer
      pageTitle={`Welcome, ${displayName}`}
      pageDescription={
        activeBusiness
          ? `You're managing ${activeBusiness.name}.`
          : 'Your AI receptionist workspace.'
      }
    >
      <div className='space-y-6'>
        {setupProgress && <SetupChecklist progress={setupProgress} />}

        {activeBusiness && (
          <Card>
            <CardContent className='space-y-3 pt-6'>
              <p className='text-foreground text-sm font-medium'>Leads &amp; handoffs</p>

              {newLeadCountError || pendingHandoffCountError ? (
                <div className='flex items-center gap-2 text-sm'>
                  <Icons.alertCircle
                    className='text-muted-foreground size-4 shrink-0'
                    aria-hidden='true'
                  />
                  <p className='text-muted-foreground'>
                    We couldn&apos;t load this right now. Refresh the page to try again.
                  </p>
                </div>
              ) : (
                <>
                  <div className='grid grid-cols-2 gap-3'>
                    <div>
                      <p className='text-muted-foreground text-xs'>New leads</p>
                      <p className='text-foreground text-2xl font-semibold'>{newLeadCount ?? 0}</p>
                    </div>
                    <div>
                      <p className='text-muted-foreground text-xs'>Pending handoffs</p>
                      <p className='text-foreground text-2xl font-semibold'>
                        {pendingHandoffCount ?? 0}
                      </p>
                    </div>
                  </div>
                  {(newLeadCount ?? 0) === 0 && (pendingHandoffCount ?? 0) === 0 && (
                    <p className='text-muted-foreground text-xs'>
                      Nothing needs attention yet — new leads and &quot;Talk to a person&quot;
                      requests from your chat widget will show up here.
                    </p>
                  )}
                </>
              )}

              <div className='flex flex-wrap gap-2 pt-1'>
                <Button
                  size='sm'
                  variant='outline'
                  render={<Link href='/dashboard/leads' aria-label='View leads' />}
                >
                  <Icons.leads className='size-4' aria-hidden='true' />
                  View leads
                </Button>
                <Button
                  size='sm'
                  variant='outline'
                  render={<Link href='/dashboard/inbox' aria-label='View inbox' />}
                >
                  <Icons.chat className='size-4' aria-hidden='true' />
                  View inbox
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className='space-y-4 pt-6'>
            <p className='text-muted-foreground text-sm'>
              This is your AI receptionist workspace — customer conversations, leads and your chat
              widget all show up here as they come in.
            </p>
            <div className='flex flex-wrap gap-2'>
              <Button render={<Link href='/dashboard/inbox' aria-label='Go to Inbox' />}>
                <Icons.chat className='size-4' aria-hidden='true' />
                Go to Inbox
              </Button>
              <Button
                variant='outline'
                render={<Link href='/dashboard/knowledge' aria-label='Manage Knowledge' />}
              >
                <Icons.knowledge className='size-4' aria-hidden='true' />
                Manage Knowledge
              </Button>
              <Button
                variant='outline'
                render={<Link href='/dashboard/widget' aria-label='Configure Widget' />}
              >
                <Icons.code className='size-4' aria-hidden='true' />
                Configure Widget
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
