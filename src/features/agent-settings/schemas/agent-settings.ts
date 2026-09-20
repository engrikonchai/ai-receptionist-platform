import * as z from 'zod';
import type { AgentResponseLength, AgentTone } from '@/lib/supabase/database.types';

/**
 * Mirrors public.agent_settings_custom_instructions_check exactly (see
 * supabase/migrations/20260924090000_agent_settings_foundation.sql):
 * NULL or a trimmed length of 1-4000 characters, never whitespace-only.
 * This is an application-level bound backed by a real database CHECK
 * constraint, not an arbitrary UI-only cap.
 */
export const AGENT_CUSTOM_INSTRUCTIONS_MAX_LENGTH = 4000;

export const AGENT_TONE_OPTIONS: readonly AgentTone[] = ['professional', 'friendly', 'warm'];
export const AGENT_RESPONSE_LENGTH_OPTIONS: readonly AgentResponseLength[] = [
  'concise',
  'balanced',
  'detailed'
];

/**
 * Validates the raw form shape (customInstructions as a plain string,
 * never null — a textarea can't hold null). Used identically by the
 * client form's onSubmit validator AND by the server action in
 * service.ts (see that file), matching this repo's existing
 * src/features/widget/schemas/widget.ts pattern of one shared schema
 * doing double duty as both client and server validation. Only the
 * *trimmed* length is bounded — a whitespace-only value trims to
 * length 0, which always passes here (it's normalized to NULL by
 * normalizeCustomInstructions() below, never rejected as an error).
 */
export const agentSettingsSchema = z.object({
  tone: z.enum(AGENT_TONE_OPTIONS as [AgentTone, ...AgentTone[]], {
    error: 'Choose a tone.'
  }),
  responseLength: z.enum(
    AGENT_RESPONSE_LENGTH_OPTIONS as [AgentResponseLength, ...AgentResponseLength[]],
    { error: 'Choose a response length.' }
  ),
  customInstructions: z
    .string()
    .refine((value) => value.trim().length <= AGENT_CUSTOM_INSTRUCTIONS_MAX_LENGTH, {
      message: `Keep it under ${AGENT_CUSTOM_INSTRUCTIONS_MAX_LENGTH} characters.`
    })
});

export type AgentSettingsFormValues = z.infer<typeof agentSettingsSchema>;

/**
 * Trims leading/trailing whitespace and converts an empty-or-
 * whitespace-only result to null — the exact normalization contract
 * public.agent_settings_custom_instructions_check expects, and what
 * this milestone's spec calls "empty after trimming becomes NULL".
 * Never interprets Markdown/HTML; the returned value is plain text,
 * stored and later rendered as plain text only (never
 * dangerouslySetInnerHTML).
 */
export function normalizeCustomInstructions(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
