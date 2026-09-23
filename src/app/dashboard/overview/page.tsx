import { cookies } from 'next/headers';
import PageContainer from '@/components/layout/page-container';
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
import { OperationalSummary } from '@/features/overview/components/operational-summary';
import { QuickActions } from '@/features/overview/components/quick-actions';
import { BillingSummary } from '@/features/overview/components/billing-summary';

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
    { count: newLeadCount, error: newLeadCountError },
    { count: pendingHandoffCount, error: pendingHandoffCountError },
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
        ctx.supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', activeBusiness.id)
          .eq('status', 'new'),
        ctx.supabase
          .from('handoffs')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', activeBusiness.id)
          .eq('status', 'new'),
        paddleConfigured
          ? ctx.supabase
              .from('business_subscriptions')
              .select('status, trial_end, current_period_end, cancel_at_period_end')
              .eq('business_id', activeBusiness.id)
              .maybeSingle()
          : Promise.resolve({ data: null })
      ])
    : [
        { data: null },
        { count: 0 },
        { count: 0, error: null },
        { count: 0, error: null },
        { data: null }
      ];

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

  return (
    <PageContainer
      pageTitle={`Welcome, ${displayName}`}
      pageDescription={
        activeBusiness
          ? `You're managing ${activeBusiness.name}.`
          : 'Your AI receptionist workspace.'
      }
    >
      <div className='flex flex-col gap-6'>
        {setupProgress && <SetupChecklist progress={setupProgress} />}

        {activeBusiness && (
          <OperationalSummary
            newLeadCount={newLeadCount ?? 0}
            pendingHandoffCount={pendingHandoffCount ?? 0}
            hasError={Boolean(newLeadCountError || pendingHandoffCountError)}
          />
        )}

        {activeBusiness && (
          <div className='grid grid-cols-1 gap-6 lg:grid-cols-3'>
            <div className='lg:col-span-2'>
              <QuickActions
                activeKnowledgeItemCount={activeKnowledgeItemCount ?? 0}
                widgetEnabled={widget?.widget_enabled ?? false}
              />
            </div>
            {paddleConfigured && <BillingSummary subscription={subscription} />}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
