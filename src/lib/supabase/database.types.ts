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
 * — confirmed applied), `handoffs.client_request_id`
 * (supabase/migrations/20260918090000_handoff_idempotency.sql — NOT
 * applied yet), and the three brand-new tables
 * `business_subscriptions` / `paddle_webhook_events` /
 * `billing_checkout_attempts`, plus the `sync_business_subscription()`
 * RPC
 * (supabase/migrations/20260920100000_paddle_billing_foundation.sql —
 * NOT applied yet) — see that file's header for why it's safe, and the
 * brand-new `agent_settings` table
 * (supabase/migrations/20260924090000_agent_settings_foundation.sql —
 * NOT applied yet) — future-facing AI behavioral configuration only, not
 * consumed by any reply engine yet; see that migration's own header for
 * the full field-ownership audit.
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

export type AgentTone = 'professional' | 'friendly' | 'warm';
export type AgentResponseLength = 'concise' | 'balanced' | 'detailed';

/**
 * Future-facing AI *behavioral* configuration only — tone, response
 * length, and custom instructions. Not read by any reply engine today;
 * see supabase/migrations/20260924090000_agent_settings_foundation.sql
 * (NOT applied yet) for the full field-ownership audit (the public
 * widget/assistant name, welcome messages, appearance, hand-off, and
 * language settings all keep their existing owners — none of that is
 * duplicated here) and for why no provider/model/API key/system-prompt
 * column exists on this table. Exactly one row per business
 * (agent_settings_business_id_key), provisioned automatically — never
 * created directly by application code.
 */
export interface AgentSettingsRow {
  id: string;
  business_id: string;
  tone: AgentTone;
  response_length: AgentResponseLength;
  /** NULL means no custom instructions set. Never interpreted as Markdown/HTML by the client. */
  custom_instructions: string | null;
  /** Set only when the owner has actually saved these settings at least once; null for an untouched, auto-provisioned default row. */
  configured_at: string | null;
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

/**
 * Mirrors Paddle's own subscription status values verbatim (see
 * https://developer.paddle.com/api-reference/subscriptions/subscription-object)
 * rather than a parallel vocabulary — the webhook handler
 * (src/app/api/paddle/webhook/route.ts) never has to translate. A
 * deliberately smaller set than a card-processor-style status enum:
 * Paddle only ever creates a subscription once its first transaction
 * has actually progressed, so there is no "incomplete" equivalent.
 */
export type BusinessSubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled';

/**
 * One row per business's Paddle subscription lifecycle — see
 * supabase/migrations/20260920100000_paddle_billing_foundation.sql (NOT
 * applied yet). Written only by the service-role key: the verified
 * Paddle webhook handler via the sync_business_subscription() RPC, and
 * the checkout/portal server actions' own service-role reads/writes
 * (src/features/billing/api/service.ts) — never directly by a plain
 * authenticated-client write. Row is never deleted on cancellation.
 *
 * `authenticated` can only SELECT a subset of these columns (see the
 * migration's column-level grant) — paddle_customer_id,
 * paddle_subscription_id, paddle_transaction_id,
 * paddle_subscription_created_at, paddle_event_occurred_at, and
 * billing_generation are never readable through that role; only
 * service-role code (always gated by verifyActiveBusiness()) reads
 * them.
 */
export interface BusinessSubscriptionRow {
  id: string;
  business_id: string;
  paddle_customer_id: string | null;
  paddle_subscription_id: string | null;
  /** The most recently known Paddle transaction for this subscription — kept best-effort, never a stand-in for paddle_subscription_id. Not readable by `authenticated`. */
  paddle_transaction_id: string | null;
  /** Paddle's own subscription `created_at` — a second-precision fallback ordering key, used by sync_business_subscription() only when neither side has a billing_generation. Not readable by `authenticated`. */
  paddle_subscription_created_at: string | null;
  /** The `occurred_at` of the last webhook event that updated this row — guards against Paddle's own unordered delivery of events for the SAME subscription. Not readable by `authenticated`. */
  paddle_event_occurred_at: string | null;
  /** The billing_checkout_attempts.generation that produced this subscription — the primary, deterministic ordering key for comparing DIFFERENT subscriptions (no two attempts ever share one, unlike a Paddle timestamp). Null for a subscription that predates this column. Not readable by `authenticated`. */
  billing_generation: number | null;
  paddle_price_id: string | null;
  status: BusinessSubscriptionStatus;
  trial_start: string | null;
  trial_end: string | null;
  /** Immutable once set — the first time a subscription with a real trial period syncs for this business. Never cleared by a later sync, a resubscribe, or a duplicate/stale webhook. This app never requests or withholds a trial itself — Paddle decides trial eligibility per customer from the Price's own configuration; this column is only this app's durable record of what happened. */
  trial_used_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
  /** Generated column (`paddle_customer_id is not null`) — the only customer-related fact `authenticated` may read. */
  has_paddle_customer: boolean;
}

/**
 * Durable Checkout-creation concurrency safety — at most one
 * `status='pending'` row per business at a time (enforced by a unique
 * partial index). See
 * supabase/migrations/20260920100000_paddle_billing_foundation.sql (NOT
 * applied yet). Read and written only by the service-role key, from
 * src/features/billing/api/checkout-attempts.ts, always after
 * verifyActiveBusiness().
 */
export interface BillingCheckoutAttemptRow {
  id: string;
  business_id: string;
  /** Strictly monotonic identity column — the deterministic ordering key copied onto business_subscriptions.billing_generation via Paddle custom_data. No two attempts ever share one. */
  generation: number;
  status: 'pending' | 'completed' | 'expired' | 'abandoned';
  paddle_transaction_id: string | null;
  created_at: string;
  /** A best-effort LOCAL staleness bound only — Paddle transactions have no provider-enforced expiry of their own, so this never by itself decides an attempt is dead; see checkout-attempts.ts. */
  expires_at: string;
}

/**
 * Idempotency ledger for the Paddle webhook handler — one row per
 * successfully processed Paddle event id. See
 * supabase/migrations/20260920100000_paddle_billing_foundation.sql (NOT
 * applied yet). Read and written only by the service-role key.
 */
export interface PaddleWebhookEventRow {
  paddle_event_id: string;
  event_type: string;
  processed_at: string;
  attempt_count: number;
  last_error: string | null;
}
