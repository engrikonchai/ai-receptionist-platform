/**
 * Shared, exact error copy for the two authorization failure modes
 * every onboarding query/action can hit (see `authorize.ts`). Mirrors
 * the identical pattern in src/features/widget/api/types.ts and
 * src/features/knowledge/api/types.ts.
 */
export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';
export const NO_BUSINESS_ACCESS_MESSAGE =
  "We couldn't find that business, or you don't have access to it.";
export const GENERIC_SAVE_ERROR = 'Something went wrong. Please try again.';

export type OnboardingActionResult = { success: true } | { success: false; error: string };
