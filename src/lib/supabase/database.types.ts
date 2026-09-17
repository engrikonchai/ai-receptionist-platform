/**
 * Hand-written row types mirroring the shared Supabase schema (the same
 * project and tables ChatbotDemo's `supabase/migrations/*.sql` define —
 * see that repo's `lib/supabase/database.types.ts`, which this file is
 * ported from). ai-receptionist-platform does not own most of this
 * schema and must not add columns/tables here that don't exist in a
 * real migration.
 *
 * The exceptions are this repo's own additive migrations:
 * `profiles.onboarding_completed` / `onboarding_completed_at`
 * (supabase/migrations/20260915000100_platform_onboarding.sql),
 * `messages.sender_type` / `messages.client_message_id`
 * (supabase/migrations/20260915170200_inbox_human_replies.sql),
 * `widget_settings.widget_enabled` / `widget_settings.allowed_origins`
 * plus the `resolve_widget_config` function
 * (supabase/migrations/20260916120000_widget_allowed_origins.sql), and
 * `widget_settings.installation_confirmed` / `installation_confirmed_at`
 * (supabase/migrations/20260917140000_widget_installation_confirmed.sql
 * — confirmed applied), and `handoffs.client_request_id`
 * (supabase/migrations/20260918090000_handoff_idempotency.sql — NOT
 * applied yet) — see each file's header for why it's safe.
 *
 * These are deliberately used as plain result-shape types (cast at the
 * query call site) rather than threaded through `SupabaseClient<Database>`'s
 * schema generic — that generic's conditional-type resolution is fragile
 * across supabase-js versions and buys little for a project this size.
 *
 * Keep this in sync with ChatbotDemo's migrations (and this repo's own
 * additive ones) whenever the shared schema changes.
 */

export type ConversationChannel = 'website' | 'instagram' | 'whatsapp';
export type ConversationStatus = 'open' | 'closed' | 'handed_off';
export type MessageRole = 'user' | 'assistant' | 'system';
export type LeadStatus = 'new' | 'contacted' | 'confirmed' | 'lost';
export type LeadSource = 'website' | 'instagram' | 'whatsapp';
export type HandoffStatus = 'new' | 'contacted' | 'resolved';
export type WidgetPosition = 'bottom-right' | 'bottom-left';
/**
 * Disambiguates who authored a role='assistant' message. Added by
 * supabase/migrations/20260915170200_inbox_human_replies.sql — every
 * row written before that migration (and every row ChatbotDemo's own
 * mock AI engine writes) has `sender_type: null`, which must always be
 * treated as 'ai' for backward compatibility. Never set for
 * role='user' or role='system' rows.
 */
export type MessageSenderType = 'ai' | 'human';

export interface ProfileRow {
  id: string;
  display_name: string | null;
  /** Set once the owner completes /onboarding — see supabase/migrations/20260915000100_platform_onboarding.sql. */
  onboarding_completed: boolean;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusinessRow {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  public_widget_id: string;
  business_type: string;
  location: string | null;
  default_language: string;
  supported_languages: string[];
  handoff_email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeItemRow {
  id: string;
  business_id: string;
  category: string;
  question: string;
  answer_en: string;
  answer_me: string | null;
  answer_ru: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ConversationRow {
  id: string;
  business_id: string;
  visitor_id: string;
  channel: ConversationChannel;
  detected_language: string;
  status: ConversationStatus;
  human_takeover: boolean;
  lead_created: boolean;
  /** Serialized mock-engine state (see ChatbotDemo's `lib/chat/types.ts`). */
  flow_state: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  intent: string | null;
  /** Null for every pre-migration row and every AI-authored row — always read null as 'ai'. */
  sender_type: MessageSenderType | null;
  /** Set only by ai-receptionist-platform's Inbox composer, for double-submit protection. Null for every row ChatbotDemo's own chat engine inserts. */
  client_message_id: string | null;
  created_at: string;
}

export interface LeadRow {
  id: string;
  business_id: string;
  conversation_id: string | null;
  reference: string;
  name: string;
  contact: string;
  check_in: string | null;
  check_out: string | null;
  guest_count: number | null;
  note: string | null;
  language: string;
  source: LeadSource;
  status: LeadStatus;
  consent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HandoffRow {
  id: string;
  business_id: string;
  conversation_id: string | null;
  customer_name: string | null;
  contact: string;
  question: string | null;
  reason: string | null;
  status: HandoffStatus;
  /** Idempotency key for a visitor-submitted handoff request — see supabase/migrations/20260918090000_handoff_idempotency.sql. Not applied yet. Null for any handoff row created another way. */
  client_request_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WidgetSettingsRow {
  id: string;
  business_id: string;
  title: string;
  welcome_message_en: string | null;
  welcome_message_me: string | null;
  welcome_message_ru: string | null;
  primary_color: string;
  position: WidgetPosition;
  mock_ai_enabled: boolean;
  /** Dedicated on/off toggle for the public embeddable widget, independent of `mock_ai_enabled` (ChatbotDemo's own, unrelated demo toggle). See supabase/migrations/20260916120000_widget_allowed_origins.sql. Not applied yet. */
  widget_enabled: boolean;
  human_handoff_enabled: boolean;
  /** Normalized "scheme://hostname[:port]" origins allowed to embed this widget (see src/lib/public-widget/origin.ts). Empty means nowhere yet — never "allow all". See supabase/migrations/20260916120000_widget_allowed_origins.sql. Not applied yet. */
  allowed_origins: string[];
  /** Owner attestation that they installed and tested the widget on their own site — see supabase/migrations/20260917140000_widget_installation_confirmed.sql. */
  installation_confirmed: boolean;
  installation_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * The row shape returned by `public.resolve_widget_config(p_widget_id,
 * p_origin)` (same migration as above, not applied yet) — the only
 * thing the public widget config endpoint (src/app/api/public-widget/config)
 * reads, via the anon key. The function itself already enforces "widget
 * exists, business active, widget enabled, origin allow-listed" in its
 * WHERE clause, so a returned row always means "show the widget"; zero
 * rows always means "don't" (unknown id, disabled, inactive, or
 * disallowed origin are all indistinguishable from the caller's side,
 * by design). Never includes business_id, owner_id, allowed_origins, or
 * handoff_email.
 */
export interface WidgetPublicConfigRpcResult {
  title: string;
  welcome_message_en: string | null;
  welcome_message_me: string | null;
  welcome_message_ru: string | null;
  primary_color: string;
  position: WidgetPosition;
  human_handoff_enabled: boolean;
  default_language: string;
  supported_languages: string[];
}
