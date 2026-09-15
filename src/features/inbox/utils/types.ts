/**
 * Unified Inbox — mock domain types.
 *
 * This is UI-only mock data (see `./data.ts`). Nothing here is wired to a
 * backend; shapes are designed to be easy to swap for a real API layer
 * later (see the `api/types.ts` → `api/service.ts` → `api/queries.ts`
 * convention used by other features).
 */

export type Channel = 'website' | 'instagram' | 'whatsapp';

export type LanguageCode = 'en' | 'me' | 'ru';

/** Conversation lifecycle, independent of unread count. */
export type ConversationStatus = 'open' | 'needs_attention' | 'resolved';

/** Who is currently responsible for replying in the conversation. */
export type HandledBy = 'ai' | 'human';

export type MessageSender = 'customer' | 'ai' | 'human' | 'system';

export type Message = {
  id: string;
  sender: MessageSender;
  /** Display name for the sender, e.g. the customer's name or "AI Receptionist". */
  author: string;
  text: string;
  timestamp: string;
  /**
   * Present on an AI message the model was not confident about. Renders
   * with an explicit label + icon (not color alone) asking for review.
   */
  lowConfidence?: {
    confidence: number;
    reason: string;
  };
};

export type LeadStatus = 'new' | 'qualified' | 'negotiating' | 'lost' | 'won';

export type CustomerNote = {
  id: string;
  author: string;
  text: string;
  timestamp: string;
};

export type CustomerDetails = {
  name: string;
  email: string;
  phone: string;
  leadStatus: LeadStatus;
  checkIn: string | null;
  checkOut: string | null;
  guests: number | null;
  requestedAccommodation: string;
  /** Rough estimate only — never a confirmed price. */
  estimatedBookingValue: string;
  tags: string[];
  assignedTeamMember: string;
  notes: CustomerNote[];
};

export type Conversation = {
  id: string;
  customer: CustomerDetails;
  channel: Channel;
  language: LanguageCode;
  status: ConversationStatus;
  handledBy: HandledBy;
  unreadCount: number;
  messages: Message[];
  suggestedReplies: string[];
};

export type StatusFilter = 'all' | 'unread' | 'needs_attention' | 'resolved';
