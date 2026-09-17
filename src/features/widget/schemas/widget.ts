import * as z from 'zod';
import { normalizeOrigin } from '@/lib/public-widget/origin';
import { isWidgetLanguage, type WidgetLanguage } from '../utils/language';

export const WIDGET_NAME_MAX_LENGTH = 100;
export const WIDGET_WELCOME_MESSAGE_MAX_LENGTH = 1000;
export const WIDGET_HANDOFF_EMAIL_MAX_LENGTH = 200;
/** A generous cap on how many origins one widget can allow-list. */
export const WIDGET_ALLOWED_ORIGINS_MAX = 20;

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const WIDGET_POSITION_VALUES = ['bottom-right', 'bottom-left'] as const;
export type WidgetPositionValue = (typeof WIDGET_POSITION_VALUES)[number];

const GENERIC_INVALID_ORIGIN_MESSAGE = 'Enter a valid website origin, e.g. https://example.com.';
const PATH_NOT_ALLOWED_MESSAGE =
  'Enter just the origin, without a path — e.g. https://example.com, not https://example.com/about.';

/**
 * True when `value` (after the same optional-scheme default
 * `normalizeOrigin()` itself applies) parses to a URL with anything
 * beyond a bare origin — a path, query string, or fragment. Used only
 * to pick a more specific error message; `normalizeOrigin()` is still
 * the single source of truth for whether the value is actually valid.
 */
function hasPathQueryOrHash(value: string): boolean {
  const trimmed = value.trim();
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    return (url.pathname !== '/' && url.pathname !== '') || url.search !== '' || url.hash !== '';
  } catch {
    return false;
  }
}

/**
 * Returns a user-facing error message for an invalid allowed-origin
 * entry, or `null` if it's valid — shared between the Zod schema below
 * (submit-time) and the TagsField's `validate` prop in
 * widget-settings-form.tsx (immediate, on add), so both surfaces agree
 * on the exact same wording for the exact same mistake.
 */
export function describeInvalidOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'Enter a domain.';
  if (trimmed.length > 253) return 'Keep it under 253 characters.';
  if (normalizeOrigin(trimmed)) return null;
  return hasPathQueryOrHash(trimmed) ? PATH_NOT_ALLOWED_MESSAGE : GENERIC_INVALID_ORIGIN_MESSAGE;
}

/**
 * An owner types a bare domain (e.g. "example.com") or a full origin
 * (e.g. "https://example.com") — `normalizeOrigin()` (shared with the
 * request-time allow-list check in src/lib/public-widget/origin.ts)
 * accepts either, defaults a missing scheme to https://, and stores the
 * canonical "scheme://hostname[:port]" form. This is what
 * `resolve_widget_config`'s exact-string match compares a request's own
 * normalized `Origin` header against, so the stored format must match
 * byte-for-byte — normalizing once, here, on save, keeps that true
 * without the owner ever having to type a scheme themselves.
 */
export const originHostSchema = z
  .string()
  .trim()
  .min(1, 'Enter a domain.')
  .max(253, 'Keep it under 253 characters.')
  .transform((value, ctx) => {
    const normalized = normalizeOrigin(value);
    if (!normalized) {
      ctx.addIssue({
        code: 'custom',
        message: hasPathQueryOrHash(value)
          ? PATH_NOT_ALLOWED_MESSAGE
          : GENERIC_INVALID_ORIGIN_MESSAGE
      });
      return z.NEVER;
    }
    return normalized;
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
