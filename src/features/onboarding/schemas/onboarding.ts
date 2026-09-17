import * as z from 'zod';
import { originHostSchema } from '@/features/widget/schemas/widget';

/**
 * Domain constants shared by the onboarding form and the server actions
 * that persist it. `business_type` has no DB check constraint (any
 * text is accepted), but the form only ever offers these — "Other"
 * covers everything else rather than accepting free text here.
 */
export const BUSINESS_TYPE_VALUES = [
  'apartment',
  'hotel',
  'restaurant',
  'tour_operator',
  'car_rental',
  'other'
] as const;

export type BusinessType = (typeof BUSINESS_TYPE_VALUES)[number];

export const BUSINESS_TYPE_OPTIONS: { value: BusinessType; label: string }[] = [
  { value: 'apartment', label: 'Apartment or vacation rental' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'tour_operator', label: 'Tour operator' },
  { value: 'car_rental', label: 'Car rental' },
  { value: 'other', label: 'Other' }
];

/** The exact codes ChatbotDemo's schema and mock chat engine expect. */
export const LANGUAGE_VALUES = ['en', 'me', 'ru'] as const;

export type LanguageCode = (typeof LANGUAGE_VALUES)[number];

export const LANGUAGE_LABEL: Record<LanguageCode, string> = {
  en: 'English',
  me: 'Montenegrin',
  ru: 'Russian'
};

export const LANGUAGE_OPTIONS: { value: LanguageCode; label: string }[] = LANGUAGE_VALUES.map(
  (value) => ({ value, label: LANGUAGE_LABEL[value] })
);

// --- Step 1: Business information ---

const defaultLanguageIsSupported = (data: {
  defaultLanguage: LanguageCode;
  supportedLanguages: LanguageCode[];
}) => data.supportedLanguages.includes(data.defaultLanguage);

const DEFAULT_LANGUAGE_NOT_SUPPORTED_MESSAGE =
  'The default language must also be one of the supported languages.';

/**
 * `websiteUrl` is intentionally never persisted to `businesses` — there
 * is no `businesses.website_url` column, and adding one would be a new
 * fact with no use beyond this single form. Its only purpose is to
 * pre-fill the allowed-origin field in the Website Connection step
 * (step 4) so the owner doesn't have to type their domain twice; see
 * onboarding-flow.tsx. Validated loosely here (it's a UX convenience,
 * not a stored value) — the real, strict validation happens where it's
 * actually saved, in websiteConnectionStepSchema's `originHostSchema`
 * below.
 */
export const businessInfoStepSchema = z
  .object({
    businessName: z
      .string()
      .trim()
      .min(1, 'Business name is required.')
      .max(200, 'Keep it under 200 characters.'),
    businessType: z.enum(BUSINESS_TYPE_VALUES, { error: 'Select a business type.' }),
    location: z.string().trim().max(200, 'Keep it under 200 characters.'),
    websiteUrl: z.string().trim().max(2048, 'Keep it under 2048 characters.'),
    defaultLanguage: z.enum(LANGUAGE_VALUES, { error: 'Select a default language.' }),
    supportedLanguages: z
      .array(z.enum(LANGUAGE_VALUES))
      .min(1, 'Select at least one supported language.')
  })
  .refine(defaultLanguageIsSupported, {
    message: DEFAULT_LANGUAGE_NOT_SUPPORTED_MESSAGE,
    path: ['defaultLanguage']
  });

export type BusinessInfoStepValues = z.infer<typeof businessInfoStepSchema>;

// --- Step 3: Widget appearance ---
// Reuses the same field-level rules as the real Widget settings form
// (src/features/widget/schemas/widget.ts) so onboarding and the
// dashboard Widget page can never silently disagree about what a
// valid assistant name, welcome message, or colour looks like — this
// step's values are saved through that exact same
// `saveWidgetSettings()` service action, not a duplicate write path.

export const WIDGET_NAME_MAX_LENGTH = 100;
export const WIDGET_WELCOME_MESSAGE_MAX_LENGTH = 1000;
export const WIDGET_HANDOFF_EMAIL_MAX_LENGTH = 200;

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const WIDGET_POSITION_VALUES = ['bottom-right', 'bottom-left'] as const;
export type WidgetPositionValue = (typeof WIDGET_POSITION_VALUES)[number];

export const widgetAppearanceStepSchema = z
  .object({
    assistantName: z
      .string()
      .trim()
      .min(1, 'Assistant name is required.')
      .max(WIDGET_NAME_MAX_LENGTH, `Keep it under ${WIDGET_NAME_MAX_LENGTH} characters.`),
    welcomeMessage: z
      .string()
      .trim()
      .min(1, 'Welcome message is required.')
      .max(
        WIDGET_WELCOME_MESSAGE_MAX_LENGTH,
        `Keep it under ${WIDGET_WELCOME_MESSAGE_MAX_LENGTH} characters.`
      ),
    primaryColor: z
      .string()
      .trim()
      .regex(HEX_COLOR_PATTERN, 'Enter a valid hex colour (e.g. #1677FF).'),
    position: z.enum(WIDGET_POSITION_VALUES, { error: 'Select a launcher position.' }),
    humanHandoffEnabled: z.boolean(),
    handoffEmail: z
      .string()
      .trim()
      .max(
        WIDGET_HANDOFF_EMAIL_MAX_LENGTH,
        `Keep it under ${WIDGET_HANDOFF_EMAIL_MAX_LENGTH} characters.`
      )
  })
  .refine((data) => !data.humanHandoffEnabled || data.handoffEmail.trim().length > 0, {
    message: 'Add a contact email to receive handoff requests, or turn off human handoff.',
    path: ['handoffEmail']
  })
  .refine(
    (data) =>
      data.handoffEmail.trim().length === 0 || z.email().safeParse(data.handoffEmail).success,
    { message: 'Enter a valid email address.', path: ['handoffEmail'] }
  );

export type WidgetAppearanceStepValues = z.infer<typeof widgetAppearanceStepSchema>;

// --- Step 4: Website connection ---
// This step is entirely optional — see MAX below and onboarding-flow.tsx's
// Skip handling. `originHostSchema` is imported from the widget feature
// (not re-declared here) so both surfaces validate/normalize an origin
// identically — the exact byte-for-byte format `resolve_widget_config`
// compares a request's Origin header against.

export const WEBSITE_CONNECTION_ORIGINS_MAX = 20;

export const websiteConnectionStepSchema = z.object({
  allowedOrigins: z
    .array(originHostSchema)
    .max(
      WEBSITE_CONNECTION_ORIGINS_MAX,
      `You can allow-list up to ${WEBSITE_CONNECTION_ORIGINS_MAX} domains.`
    )
});

export type WebsiteConnectionStepValues = z.infer<typeof websiteConnectionStepSchema>;
