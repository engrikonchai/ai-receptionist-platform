'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { onboardingSchema } from '../schemas/onboarding';

export type CompleteOnboardingResult = { success: true } | { success: false; error: string };

const GENERIC_ERROR = 'Something went wrong. Please try again.';

/**
 * Persists the onboarding form using the authenticated owner's own
 * session (Row Level Security scopes every query — no service-role
 * key). Runs three updates in a fixed order — business, then
 * widget_settings, then profiles.onboarding_completed — and stops at
 * the first failure, so onboarding is never marked complete unless the
 * business and widget data it depends on were actually saved.
 *
 * Every step is a plain UPDATE by id with the same input values, so
 * calling this again after a partial failure (network blip, one query
 * failing) just re-applies the same data and continues — safe to retry.
 *
 * Never creates a second business, never touches business.id, slug, or
 * public_widget_id, and never inserts a second widget_settings row —
 * only updates the ones the onboarding trigger already created.
 */
export async function completeOnboarding(input: unknown): Promise<CompleteOnboardingResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase is not configured for this environment yet.' };
  }

  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Please check the form for errors and try again.' };
  }
  const value = parsed.data;

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { success: false, error: 'Supabase is not configured for this environment yet.' };
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, error: 'Your session has expired. Please sign in again.' };
  }

  // "Load a business owned by that user" — RLS already scopes this
  // select to the signed-in owner's own rows; no manual owner_id
  // filter needed (and none added, per this app's established
  // convention of trusting RLS rather than re-checking it in code).
  const { data: business, error: businessLoadError } = await supabase
    .from('businesses')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (businessLoadError || !business) {
    return {
      success: false,
      error: "We couldn't find a business linked to your account. Please contact support."
    };
  }

  const { error: businessUpdateError } = await supabase
    .from('businesses')
    .update({
      name: value.businessName,
      business_type: value.businessType,
      location: value.location || null,
      default_language: value.defaultLanguage,
      supported_languages: value.supportedLanguages,
      handoff_email: value.handoffEmail
    })
    .eq('id', business.id);

  if (businessUpdateError) {
    return { success: false, error: GENERIC_ERROR };
  }

  const widgetUpdate: Record<string, string> = { title: value.widgetTitle };
  if (value.defaultLanguage === 'en') widgetUpdate.welcome_message_en = value.welcomeMessage;
  else if (value.defaultLanguage === 'me') widgetUpdate.welcome_message_me = value.welcomeMessage;
  else widgetUpdate.welcome_message_ru = value.welcomeMessage;

  const { error: widgetUpdateError } = await supabase
    .from('widget_settings')
    .update(widgetUpdate)
    .eq('business_id', business.id);

  if (widgetUpdateError) {
    return { success: false, error: GENERIC_ERROR };
  }

  const { error: profileUpdateError } = await supabase
    .from('profiles')
    .update({ onboarding_completed: true, onboarding_completed_at: new Date().toISOString() })
    .eq('id', user.id);

  if (profileUpdateError) {
    return {
      success: false,
      error: 'Your business details were saved, but we could not finish setup. Please try again.'
    };
  }

  // Every update above succeeded. Make the dashboard reflect the new
  // data on next load, then hand off navigation to Next.js itself.
  //
  // `redirect()` works by throwing a special NEXT_REDIRECT-digested
  // error that Next's own Server Action machinery is built to catch —
  // both to send the client the right response and, for an action
  // called imperatively like this one, to perform the navigation
  // itself. It must never be wrapped in a try/catch (here or by a
  // caller): doing so converts that signal into an ordinary thrown
  // error before the framework ever sees it, so the action just
  // resolves with no navigation — the exact bug this fixes. Every
  // failure path above already returned explicitly instead of
  // throwing, so there is nothing above this line that could catch it,
  // and nothing below it either — this is deliberately the last thing
  // the function does.
  revalidatePath('/dashboard/overview');
  redirect('/dashboard/overview');
}
