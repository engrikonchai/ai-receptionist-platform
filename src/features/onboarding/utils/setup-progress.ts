import type { BusinessRow, WidgetSettingsRow } from '@/lib/supabase/database.types';

/**
 * The setup checklist shown on Dashboard Overview (see
 * src/features/onboarding/components/setup-checklist.tsx) and the step
 * the first-time onboarding wizard resumes at (see
 * src/features/onboarding/components/onboarding-flow.tsx) share one
 * pure calculation, defined here, so the two surfaces can never
 * disagree about what "done" means for a given business.
 *
 * Every item except `installationConfirmed` is derived from a fact
 * that already exists in the database for its own, independent
 * reason — no duplicate boolean flags. `installationConfirmed` is the
 * one exception: see
 * supabase/migrations/20260917140000_widget_installation_confirmed.sql
 * for why that one genuinely needs its own column.
 */

export type SetupChecklistItemId =
  | 'businessProfile'
  | 'knowledgeBase'
  | 'widgetConfigured'
  | 'websiteOrigin'
  | 'installationConfirmed';

export type SetupChecklistItem = {
  id: SetupChecklistItemId;
  label: string;
  description: string;
  completed: boolean;
  /** Where "complete this" sends the owner. */
  href: string;
};

export type SetupProgress = {
  items: SetupChecklistItem[];
  completedCount: number;
  totalCount: number;
  isComplete: boolean;
};

export type SetupProgressBusinessInput = Pick<
  BusinessRow,
  'name' | 'business_type' | 'default_language' | 'supported_languages'
>;

export type SetupProgressWidgetInput = Pick<
  WidgetSettingsRow,
  | 'widget_enabled'
  | 'title'
  | 'welcome_message_en'
  | 'welcome_message_me'
  | 'welcome_message_ru'
  | 'allowed_origins'
  | 'installation_confirmed'
>;

/**
 * `welcome_message_{en,me,ru}` are all optional in the database — only
 * the business's own default_language's message is ever required (see
 * src/features/widget/schemas/widget.ts). Looks up the right column by
 * that same rule rather than requiring every language's message.
 */
function defaultLanguageWelcomeMessage(
  widget: SetupProgressWidgetInput,
  defaultLanguage: string
): string | null {
  if (defaultLanguage === 'me') return widget.welcome_message_me;
  if (defaultLanguage === 'ru') return widget.welcome_message_ru;
  return widget.welcome_message_en;
}

/**
 * `business`/`widget` are whatever the ACTIVE business currently has —
 * callers must always pass the active business's own rows (never a
 * cached or different business's), so this stays correct per the
 * active-business context for an owner with more than one business.
 */
export function computeSetupProgress(input: {
  business: SetupProgressBusinessInput;
  widget: SetupProgressWidgetInput;
  activeKnowledgeItemCount: number;
}): SetupProgress {
  const { business, widget, activeKnowledgeItemCount } = input;

  const businessProfileComplete =
    business.name.trim().length > 0 &&
    business.business_type.trim().length > 0 &&
    business.default_language.trim().length > 0 &&
    business.supported_languages.length > 0;

  const widgetConfiguredComplete =
    widget.widget_enabled &&
    widget.title.trim().length > 0 &&
    Boolean(defaultLanguageWelcomeMessage(widget, business.default_language)?.trim());

  const items: SetupChecklistItem[] = [
    {
      id: 'businessProfile',
      label: 'Business profile completed',
      description: 'Your business name, type, and languages are set.',
      completed: businessProfileComplete,
      href: '/dashboard/settings'
    },
    {
      id: 'knowledgeBase',
      label: 'At least one active knowledge item added',
      description: 'Give the AI receptionist something to answer from.',
      completed: activeKnowledgeItemCount > 0,
      href: '/dashboard/knowledge'
    },
    {
      id: 'widgetConfigured',
      label: 'Widget configured and enabled',
      description: 'An assistant name and welcome message are set, and the widget is turned on.',
      completed: widgetConfiguredComplete,
      href: '/dashboard/widget'
    },
    {
      id: 'websiteOrigin',
      label: 'At least one allowed origin added',
      description: "Your website's origin is allow-listed so the widget can respond there.",
      completed: widget.allowed_origins.length > 0,
      href: '/dashboard/widget'
    },
    {
      id: 'installationConfirmed',
      label: 'Widget installation acknowledged',
      description: "You've confirmed the widget is installed and working on your site.",
      completed: widget.installation_confirmed,
      href: '/dashboard/widget'
    }
  ];

  const completedCount = items.filter((item) => item.completed).length;

  return {
    items,
    completedCount,
    totalCount: items.length,
    isComplete: completedCount === items.length
  };
}

/** 1-based step numbers of the first-time onboarding wizard (see onboarding-flow.tsx). */
export const ONBOARDING_STEP = {
  business: 1,
  knowledge: 2,
  widgetAppearance: 3,
  websiteConnection: 4,
  completion: 5
} as const;

export type OnboardingStepNumber = (typeof ONBOARDING_STEP)[keyof typeof ONBOARDING_STEP];

/** The onboarding flow's own "add at least this many" nudge for the Knowledge step — see onboarding-flow.tsx. Skippable with a warning, never enforced server-side. */
export const MINIMUM_KNOWLEDGE_ITEMS = 3;

/**
 * Where an interrupted first-time onboarding wizard should resume.
 *
 * Step 1's own fields (business name/type/language) can never be used
 * as a "has this step been done" signal on their own: every business
 * already has non-empty values for them from the moment it's created
 * (the shared signup trigger seeds placeholder business data — see
 * supabase/migrations/20260915000100_platform_onboarding.sql's header
 * comment) — so "are the fields non-empty" is always true, even for an
 * owner who has never opened the wizard. Steps 2, 4 and 5 have no such
 * ambiguity: knowledge_items, allowed_origins and
 * installation_confirmed are all empty/false by default and only ever
 * become non-empty/true through deliberate owner action (this wizard,
 * or the equivalent dashboard pages) — so this resolver uses *those*
 * signals to decide whether the owner has gotten past step 1 at all,
 * then, only once that's established, looks at steps 2-5 individually
 * to find the first one still incomplete.
 */
export function resolveOnboardingResumeStep(input: {
  activeKnowledgeItemCount: number;
  widget: SetupProgressWidgetInput;
  onboardingCompleted: boolean;
}): OnboardingStepNumber {
  if (input.onboardingCompleted) return ONBOARDING_STEP.completion;

  const hasProgressedBeyondBusinessStep =
    input.activeKnowledgeItemCount > 0 ||
    input.widget.allowed_origins.length > 0 ||
    input.widget.installation_confirmed;

  if (!hasProgressedBeyondBusinessStep) return ONBOARDING_STEP.business;

  if (input.activeKnowledgeItemCount < MINIMUM_KNOWLEDGE_ITEMS) return ONBOARDING_STEP.knowledge;
  if (input.widget.allowed_origins.length === 0) return ONBOARDING_STEP.websiteConnection;
  return ONBOARDING_STEP.completion;
}
