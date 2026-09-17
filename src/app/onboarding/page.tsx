import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { isSupabaseConfigured, SUPABASE_MISSING_ENV_MESSAGE } from '@/lib/supabase/env';
import { loadOwnerContext } from '@/lib/supabase/owner-context';
import type { WidgetSettingsRow } from '@/lib/supabase/database.types';
import { getSiteUrl } from '@/lib/site-url';
import { AccountRecovery } from '@/features/auth/components/account-recovery';
import { OnboardingShell } from '@/features/onboarding/components/onboarding-shell';
import {
  OnboardingFlow,
  type OnboardingDefaults
} from '@/features/onboarding/components/onboarding-flow';
import {
  BUSINESS_TYPE_VALUES,
  LANGUAGE_VALUES,
  type BusinessType,
  type LanguageCode
} from '@/features/onboarding/schemas/onboarding';
import { resolveOnboardingResumeStep } from '@/features/onboarding/utils/setup-progress';

export const metadata: Metadata = {
  title: 'Set up your business'
};

export const dynamic = 'force-dynamic';

function isBusinessType(value: string): value is BusinessType {
  return (BUSINESS_TYPE_VALUES as readonly string[]).includes(value);
}

function isLanguageCode(value: string): value is LanguageCode {
  return (LANGUAGE_VALUES as readonly string[]).includes(value);
}

export default async function OnboardingPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className='flex min-h-dvh items-center justify-center p-4'>
        <div className='border-destructive/30 bg-destructive/10 max-w-md rounded-2xl border p-6 text-sm'>
          <p className='text-foreground font-semibold'>Dev only — Supabase not configured</p>
          <p className='text-muted-foreground mt-2'>{SUPABASE_MISSING_ENV_MESSAGE}</p>
        </div>
      </div>
    );
  }

  const ctx = await loadOwnerContext();

  if (ctx.status === 'unauthenticated') {
    redirect('/login?next=/onboarding');
  }

  if (ctx.status === 'incomplete_profile') {
    return <AccountRecovery email={ctx.user.email ?? undefined} />;
  }

  if (ctx.profile.onboarding_completed) {
    redirect('/dashboard/overview');
  }

  // This one-time wizard is deliberately scoped to a single business —
  // "Load a business owned by that user" — the same rule every step's
  // own save action re-verifies against: the oldest business RLS
  // returns for this owner. An owner with more than one business
  // completes setup for any additional ones through the dashboard's own
  // setup checklist (src/app/dashboard/overview), never by repeating
  // this wizard — see resolveOnboardingResumeStep's own doc comment.
  const business = ctx.businesses[0];
  const [{ data: widgetSettingsRow }, { count: activeKnowledgeItemCount }] = await Promise.all([
    ctx.supabase.from('widget_settings').select('*').eq('business_id', business.id).maybeSingle(),
    ctx.supabase
      .from('knowledge_items')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business.id)
      .eq('is_active', true)
  ]);

  const widget = widgetSettingsRow as WidgetSettingsRow | null;

  // A brand-new business always has a widget_settings row too (both are
  // created together by the shared signup trigger) — this fallback only
  // guards against that invariant somehow not holding, without ever
  // crashing the wizard.
  const widgetForResume = {
    widget_enabled: widget?.widget_enabled ?? true,
    title: widget?.title ?? '',
    welcome_message_en: widget?.welcome_message_en ?? null,
    welcome_message_me: widget?.welcome_message_me ?? null,
    welcome_message_ru: widget?.welcome_message_ru ?? null,
    allowed_origins: widget?.allowed_origins ?? [],
    installation_confirmed: widget?.installation_confirmed ?? false
  };

  const initialStep = resolveOnboardingResumeStep({
    activeKnowledgeItemCount: activeKnowledgeItemCount ?? 0,
    widget: widgetForResume,
    onboardingCompleted: ctx.profile.onboarding_completed
  });

  const defaultLanguage: LanguageCode = isLanguageCode(business.default_language)
    ? business.default_language
    : 'en';

  const welcomeMessageByLanguage: Record<LanguageCode, string | null> = {
    en: widget?.welcome_message_en ?? null,
    me: widget?.welcome_message_me ?? null,
    ru: widget?.welcome_message_ru ?? null
  };

  const defaults: OnboardingDefaults = {
    businessName: business.name,
    businessType: isBusinessType(business.business_type) ? business.business_type : 'other',
    location: business.location ?? '',
    websiteUrl: '',
    defaultLanguage,
    supportedLanguages: business.supported_languages.filter(isLanguageCode).length
      ? business.supported_languages.filter(isLanguageCode)
      : ['en'],
    assistantName: widget?.title ?? '',
    welcomeMessage: welcomeMessageByLanguage[defaultLanguage] ?? '',
    primaryColor: widget?.primary_color ?? '#1677ff',
    position: widget?.position ?? 'bottom-right',
    humanHandoffEnabled: widget?.human_handoff_enabled ?? false,
    handoffEmail: business.handoff_email ?? ctx.user.email ?? '',
    allowedOrigins: widget?.allowed_origins ?? []
  };

  return (
    <OnboardingShell>
      <OnboardingFlow
        businessId={business.id}
        publicWidgetId={business.public_widget_id}
        siteOrigin={getSiteUrl()}
        installationConfirmedAt={widget?.installation_confirmed_at ?? null}
        defaultValues={defaults}
        initialStep={initialStep}
      />
    </OnboardingShell>
  );
}
