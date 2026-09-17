'use server';

import type { HandoffRow, LeadRow } from '@/lib/supabase/database.types';
import { maskContact } from '../utils/mask';
import { verifyActiveBusiness } from './authorize';
import type { LeadDetailsResult, LeadListItem, LeadStatus, LeadStatusUpdateResult } from './types';

const LEAD_LIST_LIMIT = 200;

type LeadListRow = Pick<
  LeadRow,
  'id' | 'conversation_id' | 'reference' | 'name' | 'contact' | 'source' | 'status' | 'created_at'
>;

/**
 * Loads up to `LEAD_LIST_LIMIT` leads for the active business, newest
 * first, enriched with each originating conversation's current handoff
 * state (if any) — the same enrichment `fetchConversations()` in
 * src/features/inbox/api/service.ts does for the Inbox, mirrored here
 * rather than shared, per this app's per-feature service convention.
 * `contact` is masked before it ever leaves this function — the raw
 * value is only ever fetched by `fetchLeadDetails()` below, for the
 * authenticated detail view.
 */
export async function fetchLeads(businessId: string): Promise<LeadListItem[]> {
  const verified = await verifyActiveBusiness(businessId);
  if (!verified.ok) throw new Error(verified.error);
  const { supabase, businessId: verifiedId } = verified.ctx;

  const { data: leads, error } = await supabase
    .from('leads')
    .select('id, conversation_id, reference, name, contact, source, status, created_at')
    .eq('business_id', verifiedId)
    .order('created_at', { ascending: false })
    .limit(LEAD_LIST_LIMIT);

  if (error) throw new Error('We could not load leads. Please try again.');

  const rows = (leads ?? []) as LeadListRow[];
  if (rows.length === 0) return [];

  const conversationIds = rows
    .map((row) => row.conversation_id)
    .filter((id): id is string => Boolean(id));

  const handoffStatusByConversation = new Map<
    string,
    { status: HandoffRow['status']; humanTakeover: boolean }
  >();

  if (conversationIds.length > 0) {
    const [{ data: handoffs }, { data: conversations }] = await Promise.all([
      supabase
        .from('handoffs')
        .select('conversation_id, status')
        .eq('business_id', verifiedId)
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: false }),
      supabase
        .from('conversations')
        .select('id, human_takeover')
        .eq('business_id', verifiedId)
        .in('id', conversationIds)
    ]);

    const humanTakeoverByConversation = new Map<string, boolean>();
    for (const conversation of (conversations ?? []) as { id: string; human_takeover: boolean }[]) {
      humanTakeoverByConversation.set(conversation.id, conversation.human_takeover);
    }

    for (const handoff of (handoffs ?? []) as Pick<HandoffRow, 'conversation_id' | 'status'>[]) {
      if (!handoff.conversation_id || handoffStatusByConversation.has(handoff.conversation_id)) {
        continue;
      }
      handoffStatusByConversation.set(handoff.conversation_id, {
        status: handoff.status,
        humanTakeover: humanTakeoverByConversation.get(handoff.conversation_id) ?? false
      });
    }
  }

  return rows.map((row) => {
    const handoff = row.conversation_id
      ? handoffStatusByConversation.get(row.conversation_id)
      : undefined;

    return {
      id: row.id,
      reference: row.reference,
      displayName: row.name.trim() || 'Unnamed lead',
      maskedContact: maskContact(row.contact),
      status: row.status,
      source: row.source,
      conversationId: row.conversation_id,
      handoffStatus: handoff?.status ?? null,
      humanTakeover: handoff?.humanTakeover ?? false,
      createdAt: row.created_at
    };
  });
}

/** The full, unmasked record for one lead — only ever returned to the authenticated detail view, never the list. */
export async function fetchLeadDetails(
  businessId: string,
  leadId: string
): Promise<LeadDetailsResult> {
  const verified = await verifyActiveBusiness(businessId);
  if (!verified.ok) throw new Error(verified.error);
  const { supabase, businessId: verifiedId } = verified.ctx;

  const { data: lead, error } = await supabase
    .from('leads')
    .select(
      'id, conversation_id, reference, name, contact, check_in, check_out, guest_count, note, language, source, status, created_at'
    )
    .eq('business_id', verifiedId)
    .eq('id', leadId)
    .maybeSingle();

  if (error) throw new Error('We could not load this lead. Please try again.');
  if (!lead) return { status: 'not_found' };

  const row = lead as Pick<
    LeadRow,
    | 'id'
    | 'conversation_id'
    | 'reference'
    | 'name'
    | 'contact'
    | 'check_in'
    | 'check_out'
    | 'guest_count'
    | 'note'
    | 'language'
    | 'source'
    | 'status'
    | 'created_at'
  >;

  let handoffStatus: HandoffRow['status'] | null = null;
  let humanTakeover = false;

  if (row.conversation_id) {
    const [{ data: handoff }, { data: conversation }] = await Promise.all([
      supabase
        .from('handoffs')
        .select('status')
        .eq('business_id', verifiedId)
        .eq('conversation_id', row.conversation_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('conversations')
        .select('human_takeover')
        .eq('business_id', verifiedId)
        .eq('id', row.conversation_id)
        .maybeSingle()
    ]);

    handoffStatus = (handoff as { status: HandoffRow['status'] } | null)?.status ?? null;
    humanTakeover = (conversation as { human_takeover: boolean } | null)?.human_takeover ?? false;
  }

  return {
    status: 'ok',
    lead: {
      id: row.id,
      reference: row.reference,
      name: row.name,
      contact: row.contact,
      checkIn: row.check_in,
      checkOut: row.check_out,
      guestCount: row.guest_count,
      note: row.note,
      language: row.language,
      source: row.source,
      status: row.status,
      conversationId: row.conversation_id,
      handoffStatus,
      humanTakeover,
      createdAt: row.created_at
    }
  };
}

/**
 * The owner's own status edit — the one lead field this feature lets
 * them change. `leads_update_own` (see
 * supabase/migrations/20260915193000_repair_live_rls_policies.sql)
 * already grants full owner UPDATE on `leads`; this never needs the
 * service-role client.
 */
export async function updateLeadStatus(
  businessId: string,
  leadId: string,
  status: LeadStatus
): Promise<LeadStatusUpdateResult> {
  const verified = await verifyActiveBusiness(businessId);
  if (!verified.ok) return { success: false, error: verified.error };
  const { supabase, businessId: verifiedId } = verified.ctx;

  const { data, error } = await supabase
    .from('leads')
    .update({ status })
    .eq('business_id', verifiedId)
    .eq('id', leadId)
    .select('id')
    .maybeSingle();

  if (error) return { success: false, error: 'Something went wrong. Please try again.' };
  if (!data) return { success: false, error: 'This lead is no longer available.' };
  return { success: true };
}
