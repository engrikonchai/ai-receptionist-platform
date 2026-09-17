/**
 * Deliberately NOT `'use client'` — see the identical note in
 * src/features/widget/api/queries.ts / src/features/knowledge/api/queries.ts
 * for why: these are plain `mutationOptions()` factories with no hooks
 * and no browser APIs.
 */
import { mutationOptions } from '@tanstack/react-query';
import { markOnboardingCompleted, saveBusinessInfoStep } from './service';
import type { BusinessInfoStepValues } from '../schemas/onboarding';

export function saveBusinessInfoStepMutation(businessId: string) {
  return mutationOptions({
    mutationFn: (input: BusinessInfoStepValues) => saveBusinessInfoStep(businessId, input)
  });
}

export function markOnboardingCompletedMutation(businessId: string) {
  return mutationOptions({
    mutationFn: () => markOnboardingCompleted(businessId)
  });
}
