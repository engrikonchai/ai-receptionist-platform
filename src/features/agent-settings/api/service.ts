'use server';

import { revalidatePath } from 'next/cache';
import type { AgentSettingsRow } from '@/lib/supabase/database.types';
import { agentSettingsSchema, normalizeCustomInstructions } from '../schemas/agent-settings';
import { verifyActiveBusiness } from './authorize';
import { GENERIC_LOAD_ERROR, GENERIC_SAVE_ERROR } from './types';
import type { AgentActionResult, AgentSettings, AgentSettingsInput } from './types';

const AGENT_PATH = '/dashboard/agent';

const AGENT_SELECT = 'tone, response_length, custom_instructions';

type AgentSelectRow = Pick<AgentSettingsRow, 'tone' | 'response_length' | 'custom_instructions'>;

function toAgentSettings(row: AgentSelectRow): AgentSettings {
  return {
    tone: row.tone,
    responseLength: row.response_length,
    customInstructions: row.custom_instructions
  };
}

/**
 * Loads the active business's agent settings. Every business has
 * exactly one row (auto-provisioned — see
 * supabase/migrations/20260924090000_agent_settings_foundation.sql), so
 * a missing row here means authorization failed upstream or the row
 * genuinely doesn't exist yet (a race with provisioning, or a pre-
 * migration business in an environment where the migration hasn't run)
 * — both surface the same generic load error, never a raw Supabase
 * error message or the business id.
 */
export async function fetchAgentSettings(businessId: string): Promise<AgentSettings> {
  const verified = await verifyActiveBusiness(businessId);
  if (!verified.ok) throw new Error(verified.error);
  const { supabase, businessId: verifiedId } = verified.ctx;

  const { data, error } = await supabase
    .from('agent_settings')
    .select(AGENT_SELECT)
    .eq('business_id', verifiedId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(GENERIC_LOAD_ERROR);
  }

  return toAgentSettings(data as AgentSelectRow);
}

/**
 * Saves the agent settings form. `businessId` is never accepted from
 * the form's own values (it's the verified id, threaded in separately
 * by the caller — see queries.ts), and this never touches
 * `agent_settings.id` or `agent_settings.business_id`. Validation runs
 * here too, not only in the React form — a request that somehow
 * bypasses the client (a forged form submission, a stale client build)
 * still can't write an invalid tone/response-length or an over-length/
 * whitespace-only custom_instructions value, and the database's own
 * CHECK constraints are a further, independent backstop beyond this.
 *
 * Never logs custom_instructions, the business id, an email address, or
 * a raw Supabase error — every failure path returns only the fixed
 * GENERIC_SAVE_ERROR copy.
 *
 * Sets configured_at = now() on every successful save — the owner's own
 * record of when they last actually configured these settings,
 * distinct from the auto-provisioned row's created_at.
 */
export async function updateAgentSettings(
  businessId: string,
  input: AgentSettingsInput
): Promise<AgentActionResult> {
  const verified = await verifyActiveBusiness(businessId);
  if (!verified.ok) return { success: false, error: verified.error };
  const { supabase, businessId: verifiedId } = verified.ctx;

  const parsed = agentSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? GENERIC_SAVE_ERROR };
  }
  const value = parsed.data;

  const { error } = await supabase
    .from('agent_settings')
    .update({
      tone: value.tone,
      response_length: value.responseLength,
      custom_instructions: normalizeCustomInstructions(value.customInstructions),
      configured_at: new Date().toISOString()
    })
    .eq('business_id', verifiedId);

  if (error) return { success: false, error: GENERIC_SAVE_ERROR };

  revalidatePath(AGENT_PATH);
  return { success: true };
}
