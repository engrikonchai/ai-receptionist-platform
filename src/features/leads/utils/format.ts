import type { HandoffStatus, LeadSource, LeadStatus } from '@/lib/supabase/database.types';

/**
 * Mirrors handoffStatusIndicatorLabel() in
 * src/features/inbox/utils/format.ts (same derivation, same copy) — see
 * that function's own doc comment for why `contacted` needs
 * `humanTakeover` to disambiguate "being handled" from "returned to
 * automation". Duplicated per this app's per-feature convention rather
 * than imported cross-feature.
 */
export function handoffStatusIndicatorLabel(status: HandoffStatus, humanTakeover: boolean): string {
  if (status === 'new') return 'Handoff requested';
  if (status === 'resolved') return 'Resolved';
  return humanTakeover ? 'Being handled by human' : 'Returned to automation';
}

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  confirmed: 'Confirmed',
  lost: 'Lost'
};

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  website: 'Website',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp'
};

/** Time only for today, otherwise a short date + time — same rule as src/features/inbox/utils/format.ts's formatTimestamp(). */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return time;

  const day = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  return `${day} · ${time}`;
}
