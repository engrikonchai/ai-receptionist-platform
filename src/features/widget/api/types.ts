/**
 * Shared, exact error copy for the two authorization failure modes
 * every widget query/action can hit (see `authorize.ts`). Exported from
 * this plain module — not from `authorize.ts` itself, which imports
 * `next/headers` transitively and must never be imported by client
 * code — so the client can match on it precisely instead of guessing
 * from a substring. Mirrors the identical pattern in
 * src/features/inbox/api/types.ts and src/features/knowledge/api/types.ts.
 */
export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';
export const NO_BUSINESS_ACCESS_MESSAGE =
  "We couldn't find that business, or you don't have access to it.";
export const GENERIC_SAVE_ERROR = 'Something went wrong. Please try again.';
export const GENERIC_LOAD_ERROR = 'We could not load your widget settings. Please try again.';

/**
 * The active business's widget configuration, shaped for the dashboard
 * form and live preview — spans two tables (public.businesses and
 * public.widget_settings, one row each per business), unchanged in
 * field name/value from the database except where noted. ChatbotDemo
 * and the public widget proxy read the same underlying rows.
 */
export type WidgetSettings = {
  /** businesses.public_widget_id — the only id the public widget/embed ever sends. Read-only here. */
  publicWidgetId: string;
  /** widget_settings.widget_enabled — whether the widget responds to visitors at all. Separate from ChatbotDemo's own unrelated mock_ai_enabled toggle. */
  enabled: boolean;
  /** widget_settings.title */
  assistantName: string;
  welcomeMessageEn: string;
  welcomeMessageMe: string;
  welcomeMessageRu: string;
  primaryColor: string;
  position: 'bottom-right' | 'bottom-left';
  /** businesses.supported_languages — shared with Knowledge Base's own use of the same column. */
  supportedLanguages: string[];
  humanHandoffEnabled: boolean;
  /** businesses.handoff_email — the existing business contact field used for handoff routing. */
  handoffEmail: string;
  /** widget_settings.allowed_origins — website origins allowed to embed this widget. */
  allowedOrigins: string[];
};

export type WidgetSettingsInput = Omit<WidgetSettings, 'publicWidgetId'>;

export type WidgetActionResult = { success: true } | { success: false; error: string };
