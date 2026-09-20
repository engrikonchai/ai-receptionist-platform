import type { AgentResponseLength, AgentTone } from '@/lib/supabase/database.types';

export type { AgentResponseLength, AgentTone };

/**
 * Shared, exact error copy for the two authorization failure modes
 * every agent-settings query/action can hit (see `authorize.ts`).
 * Exported from this plain module — not from `authorize.ts` itself,
 * which imports `next/headers` transitively and must never be imported
 * by client code — so the client can match on it precisely instead of
 * guessing from a substring. Mirrors the identical pattern in
 * src/features/widget/api/types.ts and src/features/knowledge/api/types.ts.
 */
export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';
export const NO_BUSINESS_ACCESS_MESSAGE =
  "We couldn't find that business, or you don't have access to it.";
export const GENERIC_SAVE_ERROR = 'Something went wrong. Please try again.';
export const GENERIC_LOAD_ERROR = 'We could not load your agent settings. Please try again.';

/**
 * The active business's AI behavioral configuration — future input to
 * a real AI reply engine, not consumed by anything yet. See
 * supabase/migrations/20260924090000_agent_settings_foundation.sql for
 * the full field-ownership audit: the public widget/assistant name,
 * welcome messages, languages, and hand-off settings are NOT part of
 * this type — they keep their existing owners (widget_settings /
 * businesses) and are surfaced elsewhere in the dashboard.
 */
export type AgentSettings = {
  tone: AgentTone;
  responseLength: AgentResponseLength;
  /** Trimmed, non-empty text or null — never whitespace-only. Plain text: never interpreted as Markdown/HTML. */
  customInstructions: string | null;
};

/**
 * The raw form shape sent to `updateAgentSettings()` — `customInstructions`
 * is a plain (possibly empty or whitespace-only) string here, never
 * null, because a textarea can't hold null. Normalization (trim,
 * empty-after-trim -> null) happens server-side in service.ts via
 * `normalizeCustomInstructions()`, not in this type.
 */
export type AgentSettingsInput = {
  tone: AgentTone;
  responseLength: AgentResponseLength;
  customInstructions: string;
};

export type AgentActionResult = { success: true } | { success: false; error: string };
