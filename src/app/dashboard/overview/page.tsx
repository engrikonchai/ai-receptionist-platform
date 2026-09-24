import { cookies } from 'next/headers';
import PageContainer from '@/components/layout/page-container';
import { Icons } from '@/components/icons';
import { PlaceholderPage } from '@/components/layout/placeholder-page';
import {
  ACTIVE_BUSINESS_COOKIE,
  loadOwnerContext,
  resolveActiveBusinessId
} from '@/lib/supabase/owner-context';
import type { BusinessSubscriptionRow, WidgetSettingsRow } from '@/lib/supabase/database.types';
import { getPaddleEnvironment } from '@/lib/paddle/client';
import { SetupChecklist } from '@/features/onboarding/components/setup-checklist';
import { computeSetupProgress } from '@/features/onboarding/utils/setup-progress';
import { BillingSummary } from '@/features/overview/components/billing-summary';
import {
  ActivityPanel,
  AssistantPanel,
  AttentionQueue,
  NewLeadsPanel,
  type ActivityDay
} from '@/features/overview/components/overview-panels';
import { fetchConversations } from '@/features/inbox/api/service';
import { conversationAttention } from '@/features/inbox/utils/format';
import { fetchLeads } from '@/features/leads/api/service';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

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
  // The billing summary card only queries business_subscriptions when
  // Paddle is actually configured — an unconfigured environment (e.g.
  // this branch's own default state before real Paddle keys are added)
  // never surfaces a "billing unavailable" error on the one page every
  // owner sees first.
  const paddleConfigured = getPaddleEnvironment() !== null;

  const [
    { data: widgetSettingsRow },
    { count: activeKnowledgeItemCount },
    { data: subscriptionRow }
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
        paddleConfigured
          ? ctx.supabase
              .from('business_subscriptions')
              .select('status, trial_end, current_period_end, cancel_at_period_end')
              .eq('business_id', activeBusiness.id)
              .maybeSingle()
          : Promise.resolve({ data: null })
      ])
    : [{ data: null }, { count: 0 }, { data: null }];

  // The same RLS-scoped, business-verified reads the Inbox and Leads pages
  // use (latest 50 conversations / latest leads) — no new queries or
  // tables. A failure here only empties the panels; it never breaks Overview.
  const [conversationsResult, leadsResult] = activeBusiness
    ? await Promise.all([
        fetchConversations(activeBusiness.id).catch(() => null),
        fetchLeads(activeBusiness.id).catch(() => null)
      ])
    : [[], []];
  const activityLoadFailed = conversationsResult === null || leadsResult === null;
  const conversations = conversationsResult ?? [];
  const leads = leadsResult ?? [];

  const needsYou = conversations
    .filter((c) => conversationAttention(c) === 'needs_you')
    .toSorted(
      (a, b) =>
        new Date(b.latestMessageAt ?? b.updatedAt).getTime() -
        new Date(a.latestMessageAt ?? a.updatedAt).getTime()
    );
  const newLeads = leads.filter((lead) => lead.status === 'new');

  const DAY_MS = 24 * 60 * 60 * 1000;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const days: ActivityDay[] = Array.from({ length: 7 }, (_, i) => {
    const start = todayStart.getTime() - (6 - i) * DAY_MS;
    return {
      label: new Date(start).toLocaleDateString('en-GB', { weekday: 'short' }),
      count: conversations.filter((c) => {
        const at = new Date(c.latestMessageAt ?? c.updatedAt).getTime();
        return at >= start && at < start + DAY_MS;
      }).length,
      isToday: i === 6
    };
  });
  const weekStart = todayStart.getTime() - 6 * DAY_MS;
  const weekConversations = conversations.filter(
    (c) => new Date(c.latestMessageAt ?? c.updatedAt).getTime() >= weekStart
  );
  const assistantOnly = weekConversations.filter((c) => !c.handoffStatus && !c.humanTakeover);
  const weekLeadCount = leads.filter((l) => new Date(l.createdAt).getTime() >= weekStart).length;

  const widget = widgetSettingsRow as WidgetSettingsRow | null;
  const subscription = subscriptionRow as Pick<
    BusinessSubscriptionRow,
    'status' | 'trial_end' | 'current_period_end' | 'cancel_at_period_end'
  > | null;

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

  const firstName = displayName.split(/[\s@]/)[0];

  return (
    <PageContainer
      pageTitle={`Welcome back, ${firstName}`}
      pageDescription={
        activeBusiness
          ? `Here’s what’s happening at ${activeBusiness.name}.`
          : 'Your AI receptionist workspace.'
      }
      pageHeaderAction={
        activeBusiness ? (
          <Button render={<Link href='/dashboard/inbox' aria-label='Open Inbox' />}>
            <Icons.chat className='size-4' aria-hidden='true' />
            Open Inbox
          </Button>
        ) : undefined
      }
    >
      <div className='flex flex-col gap-5'>
        {setupProgress && !setupProgress.isComplete && <SetupChecklist progress={setupProgress} />}

        {activeBusiness && (
          <>
            {activityLoadFailed && (
              <p
                role='alert'
                className='text-status-danger bg-status-danger-soft rounded-xl px-4 py-3 text-sm font-semibold'
              >
                Some activity could not be loaded. Refresh to try again.
              </p>
            )}
            <div className='grid gap-5 lg:grid-cols-5'>
              <div className='lg:col-span-3'>
                <AttentionQueue items={needsYou.slice(0, 5)} total={needsYou.length} />
              </div>
              <div className='lg:col-span-2'>
                <NewLeadsPanel leads={newLeads.slice(0, 5)} total={newLeads.length} />
              </div>
            </div>
            <div className='grid gap-5 lg:grid-cols-3'>
              <ActivityPanel
                days={days}
                conversationCount={weekConversations.length}
                assistantOnlyPercent={
                  weekConversations.length > 0
                    ? Math.round((assistantOnly.length / weekConversations.length) * 100)
                    : null
                }
                leadCount={weekLeadCount}
                handoffCount={weekConversations.length - assistantOnly.length}
              />
              <div className='flex flex-col gap-5'>
                <AssistantPanel
                  widgetEnabled={widget?.widget_enabled ?? false}
                  installed={widget?.installation_confirmed ?? false}
                  activeKnowledgeCount={activeKnowledgeItemCount ?? 0}
                />
                {paddleConfigured && <BillingSummary subscription={subscription} />}
              </div>
            </div>
          </>
        )}
      </div>
    </PageContainer>
  );
}
