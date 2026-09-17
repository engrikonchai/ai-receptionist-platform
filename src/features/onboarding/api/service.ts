'use server';

import { revalidatePath } from 'next/cache';
import { businessInfoStepSchema } from '../schemas/onboarding';
import { verifyActiveBusiness } from './authorize';
import { GENERIC_SAVE_ERROR } from './types';
import type { OnboardingActionResult } from './types';

const OVERVIEW_PATH = '/dashboard/overview';
const SETTINGS_PATH = '/dashboard/settings';

/**
 * Persists the onboarding wizard's Business information step (step 1).
 * A plain UPDATE by the verified business id, mirroring every other
 * feature's own save action in this app — calling it again with the
 * same values (revisiting the step, a duplicate submit) just re-applies
 * the same row, never inserts a second business.
 *
 * `websiteUrl` is deliberately not part of this update: there is no
 * `businesses.website_url` column, and this value is only ever used
 * client-side to pre-fill the Website Connection step's origin field
 * (see onboarding-flow.tsx and schemas/onboarding.ts's own comment on
 * why).
 */
export async function saveBusinessInfoStep(
  businessId: string,
  input: unknown
): Promise<OnboardingActionResult> {
  const verified = await verifyActiveBusiness(businessId);
  if (!verified.ok) return { success: false, error: verified.error };
  const { supabase, businessId: verifiedId } = verified.ctx;

  const parsed = businessInfoStepSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? GENERIC_SAVE_ERROR };
  }
  const value = parsed.data;

  const { error } = await supabase
    .from('businesses')
    .update({
      name: value.businessName,
      business_type: value.businessType,
      location: value.location || null,
      default_language: value.defaultLanguage,
      supported_languages: value.supportedLanguages
    })
    .eq('id', verifiedId);

  if (error) return { success: false, error: GENERIC_SAVE_ERROR };

  revalidatePath(OVERVIEW_PATH);
  revalidatePath(SETTINGS_PATH);
  return { success: true };
}

/**
 * Marks the signed-in owner's one-time onboarding wizard complete —
 * the same `profiles.onboarding_completed` / `onboarding_completed_at`
 * pair the original onboarding flow already set (see
 * supabase/migrations/20260915000100_platform_onboarding.sql), moved
 * here unchanged rather than duplicated. Idempotent: entering the
 * Completion step again (a re-visit, a duplicate click) just re-applies
 * the same UPDATE to the same profile row.
 *
 * `businessId` is verified for consistency with every other action in
 * this file (defense in depth — a stale/foreign id is rejected before
 * anything is written), even though the actual mutation below only
 * ever touches `profiles.id = auth.uid()`, which `businessId` has no
 * bearing on.
 */
export async function markOnboardingCompleted(businessId: string): Promise<OnboardingActionResult> {
  const verified = await verifyActiveBusiness(businessId);
  if (!verified.ok) return { success: false, error: verified.error };
  const { supabase, user } = verified.ctx;

  const { error } = await supabase
    .from('profiles')
    .update({ onboarding_completed: true, onboarding_completed_at: new Date().toISOString() })
    .eq('id', user.id);

  if (error) {
    return {
      success: false,
      error: 'Your business details were saved, but we could not finish setup. Please try again.'
    };
  }

  revalidatePath(OVERVIEW_PATH);
  return { success: true };
}
