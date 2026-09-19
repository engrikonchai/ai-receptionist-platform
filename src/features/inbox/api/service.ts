'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ConversationRow,
  HandoffRow,
  LeadRow,
  MessageRow
} from '@/lib/supabase/database.types';
import { sendHumanReplySchema } from '../schemas/send-human-reply';
import { maskVisitorId, neutralVisitorName } from '../utils/mask';
import { verifyActiveBusiness } from './authorize';
import {
  CONVERSATION_CLOSED_ERROR,
  CONVERSATION_UNAVAILABLE_ERROR,
  GENERIC_SEND_ERROR,
  TAKE_OVER_REQUIRED_ERROR
} from './types';
import type {
  ConversationActionResult,
  ConversationListItem,
  ConversationMessage,
  ConversationMessagesResult,
  HandoffResult,
  LeadResult,
  SendHumanReplyResult
} from './types';

const CONVERSATION_LIST_LIMIT = 50;
const MESSAGE_PREVIEW_SAMPLE_LIMIT = 500;
const MESSAGE_PREVIEW_MAX_LENGTH = 140;

const INBOX_DIAGNOSTIC_LOG_PREFIX = '[inbox:diagnostic]';

/**
 * Safe, error-only diagnostic logging for a failed Inbox query —
 * NEVER called on success, so a normal Inbox load never touches
 * `console.error` at all. Logs only `stage` (a fixed, short label
 * naming which query failed) and the Supabase/Postgres error `code`
 * (a short enum-like string such as "42501" or "PGRST116") — a strict
 * whitelist. Never logs a business id, row contents, message content,
 * contact information, or the error's own message/details/hint, any
 * of which could embed identifying or customer data.
 */
function logInboxQueryFailure(stage: string, code: string | null | undefined): void {
  const safe: Record<string, unknown> = { stage };
  if (typeof code === 'string') safe.code = code;
  console.error(INBOX_DIAGNOSTIC_LOG_PREFIX, JSON.stringify(safe));
}

function truncatePreview(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MESSAGE_PREVIEW_MAX_LENGTH
    ? `${trimmed.slice(0, MESSAGE_PREVIEW_MAX_LENGTH - 1)}…`
    : trimmed;
}

type MessagePreviewRow = { conversation_id: string; content: string; created_at: string };
type LeadPreviewRow = { conversation_id: string | null; name: string; contact: string };
type HandoffPreviewRow = { conversation_id: string | null; status: HandoffRow['status'] };

/**
 * Loads the latest 50 conversations for the active business, enriched
 * with each conversation's latest message preview, lead name/contact
 * (if any), and handoff status (if any). Every enrichment query is
 * scoped by the same verified business id as the primary query — never
 * a second, independent trust decision — and the raw `visitor_id` never
 * leaves this function; only a masked id and (when there's no lead) a
 * neutral display name derived from it are returned.
 *
 * The latest-message-per-conversation lookup fetches the most recent
 * `MESSAGE_PREVIEW_SAMPLE_LIMIT` messages across all 50 conversations
 * (newest first) and keeps the first row seen per conversation.
 * PostgREST has no `DISTINCT ON`, and adding a view/RPC for one would
 * need a migration this app isn't allowed to make — so this is a
 * bounded approximation, not a per-conversation query. It only misses a
 * conversation's latest message if 500 *newer* messages exist across
 * the other 49 conversations first.
 */
export async function fetchConversations(businessId: string): Promise<ConversationListItem[]> {
  const verified = await verifyActiveBusiness(businessId);
  if (!verified.ok) throw new Error(verified.error);
  const { supabase, businessId: verifiedId } = verified.ctx;

  const { data: conversations, error } = await supabase
    .from('conversations')
    .select(
      'id, business_id, visitor_id, channel, detected_language, status, human_takeover, lead_created, created_at, updated_at'
    )
    .eq('business_id', verifiedId)
    .order('updated_at', { ascending: false })
    .limit(CONVERSATION_LIST_LIMIT);

  if (error) {
    logInboxQueryFailure('conversations_query', error.code);
    throw new Error('We could not load conversations. Please try again.');
  }

  const rows = (conversations ?? []) as ConversationRow[];
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);

  const [
    { data: recentMessages, error: messagesError },
    { data: leads, error: leadsError },
    { data: handoffs, error: handoffsError }
  ] = await Promise.all([
    supabase
      .from('messages')
      .select('conversation_id, content, created_at')
      .in('conversation_id', ids)
      .order('created_at', { ascending: false })
      .limit(MESSAGE_PREVIEW_SAMPLE_LIMIT),
    supabase
      .from('leads')
      .select('conversation_id, name, contact')
      .eq('business_id', verifiedId)
      .in('conversation_id', ids)
      .order('created_at', { ascending: false }),
    supabase
      .from('handoffs')
      .select('conversation_id, status')
      .eq('business_id', verifiedId)
      .in('conversation_id', ids)
      .order('created_at', { ascending: false })
  ]);

  if (messagesError) logInboxQueryFailure('messages_enrichment', messagesError.code);
  if (leadsError) logInboxQueryFailure('leads_enrichment', leadsError.code);
  if (handoffsError) logInboxQueryFailure('handoffs_enrichment', handoffsError.code);

  // Each enrichment source (message previews, leads, handoffs) is
  // independent and best-effort — a failure in any one of them (e.g. a
  // table whose RLS policy hasn't been applied yet) must never discard
  // the `rows` this function already successfully fetched above. Before
  // this change, any single enrichment error threw and the caller lost
  // every conversation the primary query had already found — the
  // conversations were fetched correctly but never reached the UI.
  const messageRows = messagesError ? [] : ((recentMessages ?? []) as MessagePreviewRow[]);
  const leadRows = leadsError ? [] : ((leads ?? []) as LeadPreviewRow[]);
  const handoffRows = handoffsError ? [] : ((handoffs ?? []) as HandoffPreviewRow[]);

  const latestMessageByConversation = new Map<string, { content: string; created_at: string }>();
  for (const message of messageRows) {
    if (!latestMessageByConversation.has(message.conversation_id)) {
      latestMessageByConversation.set(message.conversation_id, {
        content: message.content,
        created_at: message.created_at
      });
    }
  }

  const leadByConversation = new Map<string, { name: string; contact: string }>();
  for (const lead of leadRows) {
    if (lead.conversation_id && !leadByConversation.has(lead.conversation_id)) {
      leadByConversation.set(lead.conversation_id, { name: lead.name, contact: lead.contact });
    }
  }

  const handoffStatusByConversation = new Map<string, HandoffRow['status']>();
  for (const handoff of handoffRows) {
    if (handoff.conversation_id && !handoffStatusByConversation.has(handoff.conversation_id)) {
      handoffStatusByConversation.set(handoff.conversation_id, handoff.status);
    }
  }

  return rows.map((row) => {
    const lead = leadByConversation.get(row.id);
    const latestMessage = latestMessageByConversation.get(row.id);
    const leadName = lead?.name.trim();

    return {
      id: row.id,
      displayName: leadName ? leadName : neutralVisitorName(row.channel, row.visitor_id),
      hasLeadName: Boolean(leadName),
      leadContact: lead?.contact ?? null,
      maskedVisitorId: maskVisitorId(row.visitor_id),
      channel: row.channel,
      detectedLanguage: row.detected_language,
      status: row.status,
      humanTakeover: row.human_takeover,
      handoffStatus: handoffStatusByConversation.get(row.id) ?? null,
      latestMessagePreview: latestMessage ? truncatePreview(latestMessage.content) : null,
      latestMessageAt: latestMessage?.created_at ?? null,
      updatedAt: row.updated_at
    };
  });
}

/** Confirms `conversationId` belongs to `businessId` before reading anything scoped to it. */
async function conversationBelongsToBusiness(
  supabase: SupabaseClient,
  businessId: string,
  conversationId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('conversations')
    .select('id')
    .eq('business_id', businessId)
    .eq('id', conversationId)
    .maybeSingle();
  return Boolean(data);
}

export async function fetchConversationMessages(
  businessId: string,
  conversationId: string
): Promise<ConversationMessagesResult> {
  const verified = await verifyActiveBusiness(businessId);
  if (!verified.ok) throw new Error(verified.error);
  const { supabase, businessId: verifiedId } = verified.ctx;

  if (!(await conversationBelongsToBusiness(supabase, verifiedId, conversationId))) {
    return { status: 'not_found' };
  }

  const { data: messages, error } = await supabase
    .from('messages')
    .select('id, role, content, sender_type, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw new Error('We could not load this conversation. Please try again.');

  const rows = (messages ?? []) as Pick<
    MessageRow,
    'id' | 'role' | 'content' | 'sender_type' | 'created_at'
  >[];

  return {
    status: 'ok',
    messages: rows.map((message) => toConversationMessage(message))
  };
}

/** Resolves the null-means-AI backward-compatibility rule in exactly one place. */
function toConversationMessage(
  message: Pick<MessageRow, 'id' | 'role' | 'content' | 'sender_type' | 'created_at'>
): ConversationMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.created_at,
    senderType: message.role === 'assistant' ? (message.sender_type ?? 'ai') : null
  };
}

export async function fetchLeadForConversation(
  businessId: string,
  conversationId: string
): Promise<LeadResult> {
  const verified = await verifyActiveBusiness(businessId);
  if (!verified.ok) throw new Error(verified.error);
  const { supabase, businessId: verifiedId } = verified.ctx;

  const { data: lead, error } = await supabase
    .from('leads')
    .select('name, contact, check_in, check_out, guest_count, note, language, source, status')
    .eq('business_id', verifiedId)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error('We could not load lead details. Please try again.');
  if (!lead) return { status: 'not_found' };

  const row = lead as Pick<
    LeadRow,
    | 'name'
    | 'contact'
    | 'check_in'
    | 'check_out'
    | 'guest_count'
    | 'note'
    | 'language'
    | 'source'
    | 'status'
  >;

  return {
    status: 'ok',
    lead: {
      name: row.name,
      contact: row.contact,
      checkIn: row.check_in,
      checkOut: row.check_out,
      guestCount: row.guest_count,
      note: row.note,
      language: row.language,
      source: row.source,
      status: row.status
    }
  };
}

export async function fetchHandoffForConversation(
  businessId: string,
  conversationId: string
): Promise<HandoffResult> {
  const verified = await verifyActiveBusiness(businessId);
  if (!verified.ok) throw new Error(verified.error);
  const { supabase, businessId: verifiedId } = verified.ctx;

  const { data: handoff, error } = await supabase
    .from('handoffs')
    .select('customer_name, contact, question, reason, status')
    .eq('business_id', verifiedId)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error('We could not load handoff details. Please try again.');
  if (!handoff) return { status: 'not_found' };

  const row = handoff as Pick<
    HandoffRow,
    'customer_name' | 'contact' | 'question' | 'reason' | 'status'
  >;

  return {
    status: 'ok',
    handoff: {
      customerName: row.customer_name,
      contact: row.contact,
      question: row.question,
      reason: row.reason,
      status: row.status
    }
  };
}

async function patchConversationRow(
  supabase: SupabaseClient,
  businessId: string,
  conversationId: string,
  patch: { human_takeover?: boolean; status?: 'open' | 'closed' }
): Promise<ConversationActionResult> {
  const { data, error } = await supabase
    .from('conversations')
    .update(patch)
    .eq('business_id', businessId)
    .eq('id', conversationId)
    .select('id')
    .maybeSingle();

  if (error) return { success: false, error: 'Something went wrong. Please try again.' };
  if (!data) return { success: false, error: 'This conversation is no longer available.' };
  return { success: true };
}

async function updateConversation(
  businessId: string,
  conversationId: string,
  patch: { human_takeover?: boolean; status?: 'open' | 'closed' }
): Promise<ConversationActionResult> {
  const verified = await verifyActiveBusiness(businessId);
  if (!verified.ok) return { success: false, error: verified.error };
  return patchConversationRow(
    verified.ctx.supabase,
    verified.ctx.businessId,
    conversationId,
    patch
  );
}

/**
 * Advances the conversation's own most recent handoff row to `toStatus`
 * — but only if one exists and its current status isn't already
 * `resolved` (a resolved handoff is done; nothing here ever reopens
 * one). Owner UPDATE on `handoffs` is covered by the
 * `handoffs_update_own` RLS policy (see
 * supabase/migrations/20260915193000_repair_live_rls_policies.sql) —
 * this never needs the service-role client. A missing handoff (a
 * conversation the owner took over on their own initiative, never
 * routed through the visitor "Talk to a person" flow) is not an error;
 * there is simply nothing to advance.
 */
async function advanceHandoffStatus(
  supabase: SupabaseClient,
  businessId: string,
  conversationId: string,
  toStatus: 'contacted' | 'resolved'
): Promise<void> {
  const { data: handoff } = await supabase
    .from('handoffs')
    .select('id, status')
    .eq('business_id', businessId)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!handoff) return;
  const row = handoff as { id: string; status: HandoffRow['status'] };
  if (row.status === 'resolved') return;

  await supabase.from('handoffs').update({ status: toStatus }).eq('id', row.id);
}

/**
 * An owner accepting a pending handoff request — advances the
 * conversation from `handed_off` (requested, waiting for owner) to
 * `open` (a human is now handling it) and marks the underlying handoff
 * `contacted`, alongside the pre-existing `human_takeover` flag that
 * actually stops the automated reply engine (see postMessage() in
 * src/lib/public-widget/runtime.ts). A conversation an owner takes over
 * without any prior visitor handoff request behaves exactly as before —
 * advanceHandoffStatus() is a no-op when there's no handoff row.
 */
export async function takeOverConversation(
  businessId: string,
  conversationId: string
): Promise<ConversationActionResult> {
  const verified = await verifyActiveBusiness(businessId);
  if (!verified.ok) return { success: false, error: verified.error };
  const { supabase, businessId: verifiedId } = verified.ctx;

  const result = await patchConversationRow(supabase, verifiedId, conversationId, {
    human_takeover: true,
    status: 'open'
  });
  if (!result.success) return result;

  await advanceHandoffStatus(supabase, verifiedId, conversationId, 'contacted');
  return result;
}

/**
 * An owner explicitly handing the conversation back to the automated
 * assistant. Deliberately never writes to `handoffs` — the Inbox
 * derives "returned to automation" purely from the combination of an
 * already-`contacted` handoff plus `human_takeover === false` (see
 * HandoffStatusIndicator in status-badge.tsx), so there is nothing new
 * to persist here.
 */
export async function returnToAIConversation(
  businessId: string,
  conversationId: string
): Promise<ConversationActionResult> {
  return updateConversation(businessId, conversationId, { human_takeover: false });
}

/**
 * An owner finishing the human conversation — closes it and hands
 * control back to automation for any future message on this
 * conversation, and marks the underlying handoff (if any) `resolved`.
 */
export async function resolveConversation(
  businessId: string,
  conversationId: string
): Promise<ConversationActionResult> {
  const verified = await verifyActiveBusiness(businessId);
  if (!verified.ok) return { success: false, error: verified.error };
  const { supabase, businessId: verifiedId } = verified.ctx;

  const result = await patchConversationRow(supabase, verifiedId, conversationId, {
    status: 'closed',
    human_takeover: false
  });
  if (!result.success) return result;

  await advanceHandoffStatus(supabase, verifiedId, conversationId, 'resolved');
  return result;
}

export async function reopenConversation(
  businessId: string,
  conversationId: string
): Promise<ConversationActionResult> {
  return updateConversation(businessId, conversationId, { status: 'open' });
}

/** Postgres unique_violation — see messages_client_message_id_key in the migration. */
const UNIQUE_VIOLATION = '23505';

/**
 * Inserts a human-authored reply into a conversation the signed-in
 * owner has taken over. Every guard here is redundant with the
 * database's own `messages_insert_owner_human_reply` RLS policy (same
 * business-ownership check, same role/sender_type shape) — this
 * function exists to return a specific, friendly error for each
 * failure instead of a generic RLS-denied 403, not to be the only line
 * of defense. Never uses the service-role key.
 */
export async function sendHumanReply(input: {
  businessId: string;
  conversationId: string;
  content: string;
  clientMessageId: string;
}): Promise<SendHumanReplyResult> {
  // Authenticate and verify the active business first — a business id
  // is never trusted just because the browser sent one;
  // verifyActiveBusiness re-checks it against the signed-in owner's own
  // RLS-scoped businesses list, exactly like every other inbox action.
  const verified = await verifyActiveBusiness(input.businessId);
  if (!verified.ok) return { success: false, error: verified.error };
  const { supabase, businessId: verifiedId } = verified.ctx;

  const parsed = sendHumanReplySchema.safeParse({
    conversationId: input.conversationId,
    clientMessageId: input.clientMessageId,
    content: input.content
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? GENERIC_SEND_ERROR };
  }

  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .select('id, status, human_takeover')
    .eq('business_id', verifiedId)
    .eq('id', parsed.data.conversationId)
    .maybeSingle();

  if (conversationError) return { success: false, error: GENERIC_SEND_ERROR };
  if (!conversation) return { success: false, error: CONVERSATION_UNAVAILABLE_ERROR };

  const conversationRow = conversation as Pick<ConversationRow, 'id' | 'status' | 'human_takeover'>;
  if (conversationRow.status === 'closed') {
    return { success: false, error: CONVERSATION_CLOSED_ERROR };
  }
  if (!conversationRow.human_takeover) {
    return { success: false, error: TAKE_OVER_REQUIRED_ERROR };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('messages')
    .insert({
      conversation_id: parsed.data.conversationId,
      role: 'assistant',
      sender_type: 'human',
      content: parsed.data.content,
      client_message_id: parsed.data.clientMessageId
    })
    .select('id, role, content, sender_type, created_at')
    .single();

  if (insertError) {
    if (insertError.code === UNIQUE_VIOLATION) {
      // The same client_message_id was already inserted — a double
      // click, or a retry after a response that actually succeeded but
      // never reached the browser. Return the row that won instead of
      // erroring, so a retry can never create a second message.
      const { data: existing } = await supabase
        .from('messages')
        .select('id, role, content, sender_type, created_at')
        .eq('client_message_id', parsed.data.clientMessageId)
        .maybeSingle();

      if (existing) {
        const row = existing as Pick<
          MessageRow,
          'id' | 'role' | 'content' | 'sender_type' | 'created_at'
        >;
        return { success: true, message: toConversationMessage(row) };
      }
    }
    return { success: false, error: GENERIC_SEND_ERROR };
  }

  const row = inserted as Pick<
    MessageRow,
    'id' | 'role' | 'content' | 'sender_type' | 'created_at'
  >;
  return { success: true, message: toConversationMessage(row) };
}
