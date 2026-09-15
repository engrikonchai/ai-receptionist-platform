import * as z from 'zod';

/**
 * Domain constants shared by the onboarding form and the server action
 * that persists it. `business_type` has no DB check constraint (any
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

// --- Step 1: Business ---

export const businessStepSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(1, 'Business name is required.')
    .max(200, 'Keep it under 200 characters.'),
  businessType: z.enum(BUSINESS_TYPE_VALUES, { error: 'Select a business type.' })
});

// --- Step 2: Location and languages ---

const locationLanguagesBaseSchema = z.object({
  // Not required — matches `businesses.location`, which is nullable in
  // the shared schema — but always a `string` (possibly empty) in the
  // form's own value type, never `undefined`.
  location: z.string().trim().max(200, 'Keep it under 200 characters.'),
  defaultLanguage: z.enum(LANGUAGE_VALUES, { error: 'Select a default language.' }),
  supportedLanguages: z
    .array(z.enum(LANGUAGE_VALUES))
    .min(1, 'Select at least one supported language.')
});

function defaultLanguageIsSupported(data: {
  defaultLanguage: LanguageCode;
  supportedLanguages: LanguageCode[];
}) {
  return data.supportedLanguages.includes(data.defaultLanguage);
}

const DEFAULT_LANGUAGE_NOT_SUPPORTED_MESSAGE =
  'The default language must also be one of the supported languages.';

export const locationLanguagesStepSchema = locationLanguagesBaseSchema.refine(
  defaultLanguageIsSupported,
  { message: DEFAULT_LANGUAGE_NOT_SUPPORTED_MESSAGE, path: ['defaultLanguage'] }
);

// --- Step 3: Customer handoff ---

export const handoffStepSchema = z.object({
  handoffEmail: z
    .string()
    .trim()
    .min(1, 'Handoff email is required.')
    .email('Enter a valid email address.'),
  widgetTitle: z
    .string()
    .trim()
    .min(1, 'Widget title is required.')
    .max(100, 'Keep it under 100 characters.'),
  welcomeMessage: z
    .string()
    .trim()
    .min(1, 'Welcome message is required.')
    .max(1000, 'Keep it under 1000 characters.')
});

// --- Full form (final re-validation) ---

export const onboardingSchema = businessStepSchema
  .and(locationLanguagesBaseSchema)
  .and(handoffStepSchema)
  .refine(defaultLanguageIsSupported, {
    message: DEFAULT_LANGUAGE_NOT_SUPPORTED_MESSAGE,
    path: ['defaultLanguage']
  });

export type OnboardingValues = z.infer<typeof onboardingSchema>;

export const onboardingStepSchemas = [
  businessStepSchema,
  locationLanguagesStepSchema,
  handoffStepSchema
];
