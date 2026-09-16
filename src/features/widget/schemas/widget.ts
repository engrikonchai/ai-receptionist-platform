import * as z from 'zod';
import { isWidgetLanguage, type WidgetLanguage } from '../utils/language';

export const WIDGET_NAME_MAX_LENGTH = 100;
export const WIDGET_WELCOME_MESSAGE_MAX_LENGTH = 1000;
export const WIDGET_HANDOFF_EMAIL_MAX_LENGTH = 200;
/** A generous cap on how many origins one widget can allow-list. */
export const WIDGET_ALLOWED_ORIGINS_MAX = 20;

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const WIDGET_POSITION_VALUES = ['bottom-right', 'bottom-left'] as const;
export type WidgetPositionValue = (typeof WIDGET_POSITION_VALUES)[number];

/**
 * A bare origin's host — no scheme, no path, no trailing slash — e.g.
 * `example.com`, `www.example.com`, or `localhost:3000` for local
 * testing. Kept intentionally simple (this is an allow-list an owner
 * fills in by hand, not a general-purpose URL parser); the server is
 * still the one that ultimately compares this against a request's real
 * Origin header, never trusting this format alone as a security
 * boundary.
 */
const ORIGIN_HOST_PATTERN =
  /^(localhost(:\d{1,5})?|(\d{1,3}\.){3}\d{1,3}(:\d{1,5})?|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(:\d{1,5})?)$/i;

const originHostSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Enter a domain.')
  .max(253, 'Keep it under 253 characters.')
  .refine((value) => !value.includes('://'), {
    message: 'Enter just the domain, without https:// (e.g. example.com).'
  })
  .refine((value) => ORIGIN_HOST_PATTERN.test(value), {
    message: 'Enter a valid domain (e.g. example.com or www.example.com).'
  });

const welcomeMessageField = z
  .string()
  .trim()
  .max(
    WIDGET_WELCOME_MESSAGE_MAX_LENGTH,
    `Keep it under ${WIDGET_WELCOME_MESSAGE_MAX_LENGTH} characters.`
  );

/**
 * The base shape, before the default-language welcome message is
 * required. Mirrors src/features/knowledge/schemas/knowledge.ts's
 * `knowledgeItemBaseSchema` / `knowledgeItemSchema(defaultLanguage)`
 * pattern exactly.
 */
export const widgetSettingsBaseSchema = z.object({
  enabled: z.boolean(),
  assistantName: z
    .string()
    .trim()
    .min(1, 'Assistant name is required.')
    .max(WIDGET_NAME_MAX_LENGTH, `Keep it under ${WIDGET_NAME_MAX_LENGTH} characters.`),
  welcomeMessageEn: welcomeMessageField,
  welcomeMessageMe: welcomeMessageField,
  welcomeMessageRu: welcomeMessageField,
  primaryColor: z
    .string()
    .trim()
    .regex(HEX_COLOR_PATTERN, 'Enter a valid hex colour (e.g. #1677FF).'),
  position: z.enum(WIDGET_POSITION_VALUES, { error: 'Select a launcher position.' }),
  supportedLanguages: z
    .array(z.enum(['en', 'me', 'ru'] as const))
    .min(1, 'Select at least one reply language.'),
  humanHandoffEnabled: z.boolean(),
  handoffEmail: z
    .string()
    .trim()
    .max(
      WIDGET_HANDOFF_EMAIL_MAX_LENGTH,
      `Keep it under ${WIDGET_HANDOFF_EMAIL_MAX_LENGTH} characters.`
    ),
  allowedOrigins: z
    .array(originHostSchema)
    .max(
      WIDGET_ALLOWED_ORIGINS_MAX,
      `You can allow-list up to ${WIDGET_ALLOWED_ORIGINS_MAX} domains.`
    )
});

export type WidgetSettingsFormValues = z.infer<typeof widgetSettingsBaseSchema>;

const ANSWER_FIELD_BY_LANGUAGE: Record<
  WidgetLanguage,
  'welcomeMessageEn' | 'welcomeMessageMe' | 'welcomeMessageRu'
> = {
  en: 'welcomeMessageEn',
  me: 'welcomeMessageMe',
  ru: 'welcomeMessageRu'
};

/**
 * The default-language welcome message is required; a handoff contact
 * email is required only when human handoff is enabled — everything
 * else is optional. `defaultLanguage` comes from the active business
 * (business.default_language), never from the browser in a way that
 * could loosen validation: the server action re-derives it from the
 * same verified business row it already loaded, not from form input.
 */
export function widgetSettingsSchema(defaultLanguage: string) {
  const field = isWidgetLanguage(defaultLanguage)
    ? ANSWER_FIELD_BY_LANGUAGE[defaultLanguage]
    : 'welcomeMessageEn';

  return widgetSettingsBaseSchema
    .refine((data) => data[field].trim().length > 0, {
      message: 'A welcome message in the default language is required.',
      path: [field]
    })
    .refine((data) => !data.humanHandoffEnabled || data.handoffEmail.trim().length > 0, {
      message: 'Add a contact email to receive handoff requests, or turn off human handoff.',
      path: ['handoffEmail']
    })
    .refine(
      (data) =>
        data.handoffEmail.trim().length === 0 || z.email().safeParse(data.handoffEmail).success,
      {
        message: 'Enter a valid email address.',
        path: ['handoffEmail']
      }
    );
}
