import type { HandoffStatus, LeadSource, LeadStatus } from '@/lib/supabase/database.types';

export type { HandoffStatus, LeadSource, LeadStatus };

/**
 * Shared, exact error copy for the two authorization failure modes every
 * leads query/action can hit (see `authorize.ts`) — same convention and
 * same copy as src/features/inbox/api/types.ts and
 * src/features/knowledge/api/types.ts.
 */
export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';
export const NO_BUSINESS_ACCESS_MESSAGE =
  "We couldn't find that business, or you don't have access to it.";

export type LeadListFilter = 'all' | LeadStatus;

/** One row in the leads list — the contact is always masked; only the detail view ever gets the full value. */
export type LeadListItem = {
  id: string;
  reference: string;
  displayName: string;
  maskedContact: string;
  status: LeadStatus;
  source: LeadSource;
  conversationId: string | null;
  /** The originating conversation's current handoff state, if any — null when this lead never went through "Talk to a person". */
  handoffStatus: HandoffStatus | null;
  humanTakeover: boolean;
  createdAt: string;
};

/** The full, unmasked record — only ever returned to the authenticated lead-detail view. */
export type LeadDetails = {
  id: string;
  reference: string;
  name: string;
  contact: string;
  checkIn: string | null;
  checkOut: string | null;
  guestCount: number | null;
  note: string | null;
  language: string;
  source: LeadSource;
  status: LeadStatus;
  conversationId: string | null;
  handoffStatus: HandoffStatus | null;
  humanTakeover: boolean;
  createdAt: string;
};

export type LeadDetailsResult = { status: 'ok'; lead: LeadDetails } | { status: 'not_found' };

export type LeadStatusUpdateResult = { success: true } | { success: false; error: string };
