'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ConversationRow,
  HandoffRow,
  LeadRow,
  MessageRow
} from '@/lib/supabase/database.types';
import { maskVisitorId, neutralVisitorName } from '../utils/mask';
import { verifyActiveBusiness } from './authorize';
import type {
  ConversationActionResult,
  ConversationListItem,
  ConversationMessagesResult,
  HandoffResult,
  LeadResult
} from './types';

const CONVERSATION_LIST_LIMIT = 50;
const MESSAGE_PREVIEW_SAMPLE_LIMIT = 500;
const MESSAGE_PREVIEW_MAX_LENGTH = 140;

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

  if (error) throw new Error('We could not load conversations. Please try again.');

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

  if (messagesError || leadsError || handoffsError) {
    throw new Error('We could not load conversations. Please try again.');
  }

  const latestMessageByConversation = new Map<string, { content: string; created_at: string }>();
  for (const message of (recentMessages ?? []) as MessagePreviewRow[]) {
    if (!latestMessageByConversation.has(message.conversation_id)) {
      latestMessageByConversation.set(message.conversation_id, {
        content: message.content,
        created_at: message.created_at
      });
    }
  }

  const leadByConversation = new Map<string, { name: string; contact: string }>();
  for (const lead of (leads ?? []) as LeadPreviewRow[]) {
    if (lead.conversation_id && !leadByConversation.has(lead.conversation_id)) {
      leadByConversation.set(lead.conversation_id, { name: lead.name, contact: lead.contact });
    }
  }

  const handoffStatusByConversation = new Map<string, HandoffRow['status']>();
  for (const handoff of (handoffs ?? []) as HandoffPreviewRow[]) {
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
    .select('id, role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw new Error('We could not load this conversation. Please try again.');

  const rows = (messages ?? []) as Pick<MessageRow, 'id' | 'role' | 'content' | 'created_at'>[];

  return {
    status: 'ok',
    messages: rows.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.created_at
    }))
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

async function updateConversation(
  businessId: string,
  conversationId: string,
  patch: { human_takeover: boolean } | { status: 'open' | 'closed' }
): Promise<ConversationActionResult> {
  const verified = await verifyActiveBusiness(businessId);
  if (!verified.ok) return { success: false, error: verified.error };
  const { supabase, businessId: verifiedId } = verified.ctx;

  const { data, error } = await supabase
    .from('conversations')
    .update(patch)
    .eq('business_id', verifiedId)
    .eq('id', conversationId)
    .select('id')
    .maybeSingle();

  if (error) return { success: false, error: 'Something went wrong. Please try again.' };
  if (!data) return { success: false, error: 'This conversation is no longer available.' };
  return { success: true };
}

export async function takeOverConversation(
  businessId: string,
  conversationId: string
): Promise<ConversationActionResult> {
  return updateConversation(businessId, conversationId, { human_takeover: true });
}

export async function returnToAIConversation(
  businessId: string,
  conversationId: string
): Promise<ConversationActionResult> {
  return updateConversation(businessId, conversationId, { human_takeover: false });
}

export async function resolveConversation(
  businessId: string,
  conversationId: string
): Promise<ConversationActionResult> {
  return updateConversation(businessId, conversationId, { status: 'closed' });
}

export async function reopenConversation(
  businessId: string,
  conversationId: string
): Promise<ConversationActionResult> {
  return updateConversation(businessId, conversationId, { status: 'open' });
}
