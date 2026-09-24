import type {
  ConversationChannel,
  ConversationStatus,
  HandoffStatus,
  LeadStatus
} from '@/lib/supabase/database.types';

export const CHANNEL_LABEL: Record<ConversationChannel, string> = {
  website: 'Website',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp'
};

export const CHANNEL_ICON: Record<ConversationChannel, 'website' | 'instagram' | 'whatsapp'> = {
  website: 'website',
  instagram: 'instagram',
  whatsapp: 'whatsapp'
};

const KNOWN_LANGUAGE_LABEL: Record<string, string> = {
  en: 'English',
  me: 'Montenegrin (Latin)',
  ru: 'Русский'
};

/** Falls back to the raw code for any language ChatbotDemo adds later. */
export function languageLabel(code: string): string {
  return KNOWN_LANGUAGE_LABEL[code] ?? code;
}

export const STATUS_LABEL: Record<ConversationStatus, string> = {
  open: 'Open',
  handed_off: 'Handed off',
  closed: 'Closed'
};

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  confirmed: 'Confirmed',
  lost: 'Lost'
};

export const HANDOFF_STATUS_LABEL: Record<HandoffStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  resolved: 'Resolved'
};

/**
 * The Inbox's own human-facing state for a handoff, derived from the
 * two columns that together carry it — `handoffs.status` plus the
 * conversation's own `human_takeover` flag — rather than a fourth
 * database value. `contacted` is intentionally ambiguous on its own: it
 * means "no longer just requested" whether an owner is actively
 * replying (`human_takeover = true`) or explicitly handed the
 * conversation back to the assistant afterward (`human_takeover =
 * false`, set by returnToAIConversation() in api/service.ts, which
 * never touches `handoffs` itself) — this is the one place that tells
 * those two apart for display.
 */
export function handoffStatusIndicatorLabel(status: HandoffStatus, humanTakeover: boolean): string {
  if (status === 'new') return 'Handoff requested';
  if (status === 'resolved') return 'Resolved';
  return humanTakeover ? 'Being handled by human' : 'Returned to automation';
}

/** Time only for today, otherwise a short date + time — for any ISO timestamp from the DB. */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return time;

  const day = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  return `${day} · ${time}`;
}

/**
 * Compact "how long ago" for list rows: "now", "4m", "3h", "Yesterday",
 * then a short date. Falls back to '' for an unparseable timestamp.
 */
export function formatRelativeShort(iso: string, nowMs: number = Date.now()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.floor((nowMs - date.getTime()) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  if (hours < 48) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

/**
 * The one state an owner needs to scan a conversation by, derived from
 * the fields the list already carries — never a new database value.
 *
 *  needs_you — the visitor asked for a person and nobody has picked it up
 *  with_you  — the owner has taken over and is replying
 *  ai        — the assistant is handling it
 *  closed    — resolved
 */
export type ConversationAttention = 'needs_you' | 'with_you' | 'ai' | 'closed';

export function conversationAttention(c: {
  status: ConversationStatus;
  humanTakeover: boolean;
  handoffStatus: HandoffStatus | null;
}): ConversationAttention {
  if (c.status === 'closed') return 'closed';
  if (c.humanTakeover) return 'with_you';
  if (c.handoffStatus === 'new' || c.status === 'handed_off') return 'needs_you';
  return 'ai';
}

export const ATTENTION_LABEL: Record<ConversationAttention, string> = {
  needs_you: 'Needs you',
  with_you: 'With you',
  ai: 'AI handling',
  closed: 'Closed'
};
