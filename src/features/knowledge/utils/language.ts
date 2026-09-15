/**
 * The Knowledge Base has exactly three fixed answer languages — they
 * map 1:1 to the `answer_en` / `answer_me` / `answer_ru` columns on
 * public.knowledge_items, which ChatbotDemo's schema fixes structurally
 * (there is no generic "answers" table to extend). A business's
 * `supported_languages` (set at onboarding, see
 * src/features/onboarding/schemas/onboarding.ts) is always a subset of
 * these three.
 */
export const KNOWLEDGE_LANGUAGES = ['en', 'me', 'ru'] as const;

export type KnowledgeLanguage = (typeof KNOWLEDGE_LANGUAGES)[number];

export const KNOWLEDGE_LANGUAGE_LABEL: Record<KnowledgeLanguage, string> = {
  en: 'English',
  me: 'Montenegrin',
  ru: 'Russian'
};

export function isKnowledgeLanguage(value: string): value is KnowledgeLanguage {
  return (KNOWLEDGE_LANGUAGES as readonly string[]).includes(value);
}
