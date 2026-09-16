/**
 * The widget has exactly three fixed reply languages — they map 1:1 to
 * the `welcome_message_en` / `welcome_message_me` / `welcome_message_ru`
 * columns on public.widget_settings, which ChatbotDemo's schema fixes
 * structurally (there is no generic "messages" table to extend). This
 * mirrors src/features/knowledge/utils/language.ts exactly — each
 * feature owns its own thin copy rather than importing cross-feature,
 * per this app's established convention.
 */
export const WIDGET_LANGUAGES = ['en', 'me', 'ru'] as const;

export type WidgetLanguage = (typeof WIDGET_LANGUAGES)[number];

export const WIDGET_LANGUAGE_LABEL: Record<WidgetLanguage, string> = {
  en: 'English',
  me: 'Montenegrin',
  ru: 'Russian'
};

export const WIDGET_LANGUAGE_OPTIONS: { value: WidgetLanguage; label: string }[] =
  WIDGET_LANGUAGES.map((value) => ({ value, label: WIDGET_LANGUAGE_LABEL[value] }));

export function isWidgetLanguage(value: string): value is WidgetLanguage {
  return (WIDGET_LANGUAGES as readonly string[]).includes(value);
}
