import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { isSupabaseConfigured, SUPABASE_MISSING_ENV_MESSAGE } from '@/lib/supabase/env';
import { loadOwnerContext } from '@/lib/supabase/owner-context';
import type { WidgetSettingsRow } from '@/lib/supabase/database.types';
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

  // "Load a business owned by that user" — same rule the completion
  // action uses: the oldest business RLS returns for this owner.
  const business = ctx.businesses[0];
  const { data: widgetSettings } = await ctx.supabase
    .from('widget_settings')
    .select('*')
    .eq('business_id', business.id)
    .maybeSingle();

  const widget = widgetSettings as WidgetSettingsRow | null;

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
    defaultLanguage,
    supportedLanguages: business.supported_languages.filter(isLanguageCode).length
      ? business.supported_languages.filter(isLanguageCode)
      : ['en'],
    handoffEmail: business.handoff_email ?? ctx.user.email ?? '',
    widgetTitle: widget?.title ?? '',
    welcomeMessage: welcomeMessageByLanguage[defaultLanguage] ?? ''
  };

  return (
    <OnboardingShell>
      <OnboardingFlow defaultValues={defaults} />
    </OnboardingShell>
  );
}
