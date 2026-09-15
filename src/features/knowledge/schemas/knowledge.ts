import * as z from 'zod';
import { isKnowledgeLanguage, type KnowledgeLanguage } from '../utils/language';

/**
 * Maximum lengths chosen to comfortably cover realistic FAQ content
 * (matching the scale of other free-text fields already in this schema,
 * e.g. business.name at 200 and the widget welcome message at 1000)
 * without imposing a real Supabase column limit this app doesn't own —
 * `knowledge_items`'s text columns have no length constraint in the
 * database, so these are purely an application-level sanity bound.
 */
export const KNOWLEDGE_CATEGORY_MAX_LENGTH = 100;
export const KNOWLEDGE_QUESTION_MAX_LENGTH = 300;
export const KNOWLEDGE_ANSWER_MAX_LENGTH = 2000;
/** A generous cap, not a real limit — just keeps sort_order a plausible small integer. */
export const KNOWLEDGE_SORT_ORDER_MAX = 100000;

const answerField = z
  .string()
  .trim()
  .max(KNOWLEDGE_ANSWER_MAX_LENGTH, `Keep it under ${KNOWLEDGE_ANSWER_MAX_LENGTH} characters.`);

/**
 * The base shape, before the default-language answer is required.
 * `answerEn` is always present in the form (see the sheet component)
 * because `knowledge_items.answer_en` is `not null` in the database
 * regardless of a business's chosen default_language — every business
 * can store an English answer even when English isn't one of their
 * supported_languages, and the column can never be left out of an
 * insert/update. Everything else in this schema treats English exactly
 * like Montenegrin and Russian: optional unless it happens to be the
 * default language.
 */
export const knowledgeItemBaseSchema = z.object({
  category: z
    .string()
    .trim()
    .min(1, 'Category is required.')
    .max(
      KNOWLEDGE_CATEGORY_MAX_LENGTH,
      `Keep it under ${KNOWLEDGE_CATEGORY_MAX_LENGTH} characters.`
    ),
  question: z
    .string()
    .trim()
    .min(1, 'Question is required.')
    .max(
      KNOWLEDGE_QUESTION_MAX_LENGTH,
      `Keep it under ${KNOWLEDGE_QUESTION_MAX_LENGTH} characters.`
    ),
  answerEn: answerField,
  answerMe: answerField,
  answerRu: answerField,
  isActive: z.boolean(),
  sortOrder: z
    .number({ error: 'Enter a sort order.' })
    .int('Sort order must be a whole number.')
    .nonnegative('Sort order cannot be negative.')
    .max(KNOWLEDGE_SORT_ORDER_MAX, `Keep it under ${KNOWLEDGE_SORT_ORDER_MAX}.`)
});

export type KnowledgeItemFormValues = z.infer<typeof knowledgeItemBaseSchema>;

const ANSWER_FIELD_BY_LANGUAGE: Record<KnowledgeLanguage, 'answerEn' | 'answerMe' | 'answerRu'> = {
  en: 'answerEn',
  me: 'answerMe',
  ru: 'answerRu'
};

/**
 * The default-language answer is required — everything else is
 * optional. `defaultLanguage` comes from the active business
 * (business.default_language), never from the browser in a way that
 * could be spoofed to loosen validation: the server action re-derives
 * it from the same verified business row it already loaded, not from
 * form input.
 */
export function knowledgeItemSchema(defaultLanguage: string) {
  const field = isKnowledgeLanguage(defaultLanguage)
    ? ANSWER_FIELD_BY_LANGUAGE[defaultLanguage]
    : 'answerEn';

  return knowledgeItemBaseSchema.refine((data) => data[field].trim().length > 0, {
    message: 'An answer in the default language is required.',
    path: [field]
  });
}
