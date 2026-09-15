import type {
  ConversationChannel,
  ConversationStatus,
  HandoffStatus,
  LeadSource,
  LeadStatus,
  MessageRole,
  MessageSenderType
} from '@/lib/supabase/database.types';

export type {
  ConversationChannel,
  ConversationStatus,
  HandoffStatus,
  LeadSource,
  LeadStatus,
  MessageRole,
  MessageSenderType
};

export type InboxStatusFilter = 'all' | ConversationStatus;

/**
 * Shared, exact error copy for the two authorization failure modes every
 * inbox query/action can hit (see `authorize.ts`). Exported from this
 * plain module — not from `authorize.ts` itself, which imports
 * `next/headers` transitively and must never be imported by client code
 * — so the client can match on it precisely instead of guessing from a
 * substring.
 */
export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';
export const NO_BUSINESS_ACCESS_MESSAGE =
  "We couldn't find that business, or you don't have access to it.";

/** Shared, exact error copy for sendHumanReply()'s failure modes. */
export const CONVERSATION_UNAVAILABLE_ERROR = 'This conversation is no longer available.';
export const CONVERSATION_CLOSED_ERROR = 'This conversation is resolved. Reopen it to reply.';
export const TAKE_OVER_REQUIRED_ERROR = 'Take over this conversation before sending a reply.';
export const GENERIC_SEND_ERROR = 'Something went wrong sending your message. Please try again.';

/** One row in the conversation list — never carries the raw visitor id. */
export type ConversationListItem = {
  id: string;
  /** The lead's name if one has been captured, otherwise a masked, channel-neutral placeholder. */
  displayName: string;
  hasLeadName: boolean;
  leadContact: string | null;
  maskedVisitorId: string;
  channel: ConversationChannel;
  detectedLanguage: string;
  status: ConversationStatus;
  humanTakeover: boolean;
  handoffStatus: HandoffStatus | null;
  latestMessagePreview: string | null;
  latestMessageAt: string | null;
  updatedAt: string;
};

export type ConversationMessage = {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  /**
   * Only meaningful when role === 'assistant': 'human' means a business
   * owner sent it from the Inbox, 'ai' means the AI receptionist
   * (already resolved from a null DB value for backward compatibility —
   * see MessageSenderType). Always null for role 'user' or 'system'.
   */
  senderType: MessageSenderType | null;
};

export type ConversationMessagesResult =
  | { status: 'ok'; messages: ConversationMessage[] }
  | { status: 'not_found' };

export type SendHumanReplyResult =
  | { success: true; message: ConversationMessage }
  | { success: false; error: string };

export type LeadDetails = {
  name: string;
  contact: string;
  checkIn: string | null;
  checkOut: string | null;
  guestCount: number | null;
  note: string | null;
  language: string;
  source: LeadSource;
  status: LeadStatus;
};

export type LeadResult = { status: 'ok'; lead: LeadDetails } | { status: 'not_found' };

export type HandoffDetails = {
  customerName: string | null;
  contact: string;
  question: string | null;
  reason: string | null;
  status: HandoffStatus;
};

export type HandoffResult = { status: 'ok'; handoff: HandoffDetails } | { status: 'not_found' };

export type ConversationActionResult = { success: true } | { success: false; error: string };
