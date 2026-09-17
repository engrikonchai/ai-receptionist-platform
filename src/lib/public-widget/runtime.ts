import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConversationRow, MessageRow } from '@/lib/supabase/database.types';
import { generateKnowledgeReply } from './knowledge-reply';
import {
  buildContactLine,
  sanitizeFreeText,
  HANDOFF_MESSAGE_MAX_LENGTH,
  HANDOFF_NAME_MAX_LENGTH
} from './handoff-contact';
import { isOriginAllowed } from './origin';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import {
  isWidgetSessionSigningConfigured,
  issueWidgetSessionToken,
  verifyWidgetSessionToken
} from './session-token';

/**
 * The trusted, in-platform public widget runtime — the multi-tenant
 * replacement for the earlier proxy-to-ChatbotDemo design.
 *
 * Every entry point below (`startOrContinueSession`, `postMessage`)
 * takes only a `publicWidgetId` (an opaque value the visitor's browser
 * sends) and resolves it to a `business_id` itself, via
 * `resolveWidgetForRuntime()`, using the service-role client (see
 * src/lib/supabase/service-role.ts for why that's scoped and safe
 * here). `business_id` is never accepted as an input to any function in
 * this file — there is no parameter for it. Every conversation/message
 * row this module writes is scoped to the id this module itself
 * resolved, so a second business's widget can never read or write into
 * a different business's data no matter what a malicious caller sends.
 *
 * `business_id` (and `conversation_id` + `visitor_id` agreement) alone
 * is still not the authorization boundary for reading/writing an
 * *existing* conversation — see session-token.ts's doc comment. A
 * signed widget session token, issued here and re-verified on every
 * message, is what actually proves a caller is the same visitor
 * `startOrContinueSession()` issued that conversation to. That token
 * deliberately never carries `business_id` (it's a signed, not
 * encrypted, base64url payload — readable by the browser even though
 * it can't be modified) — every function below re-resolves
 * `business_id` itself from `publicWidgetId` on every call instead.
 */

export type RuntimeMessage = { role: 'user' | 'assistant'; text: string };

type ResolvedWidget =
  | { status: 'unknown' }
  | { status: 'origin_denied' }
  | { status: 'disabled' }
  | { status: 'unavailable' }
  | {
      status: 'ok';
      businessId: string;
      defaultLanguage: string;
      welcomeMessageEn: string | null;
      welcomeMessageMe: string | null;
      welcomeMessageRu: string | null;
      humanHandoffEnabled: boolean;
    };

type BusinessLookupRow = { id: string; is_active: boolean; default_language: string };
type WidgetSettingsLookupRow = {
  business_id: string;
  widget_enabled: boolean;
  allowed_origins: string[];
  welcome_message_en: string | null;
  welcome_message_me: string | null;
  welcome_message_ru: string | null;
  human_handoff_enabled: boolean;
};

/**
 * The one place `public_widget_id` is turned into `business_id` for the
 * trusted runtime. Deliberately mirrors the checks
 * `public.resolve_widget_config` enforces in SQL for the anon-facing
 * config endpoint (widget exists, business active, widget enabled,
 * origin allow-listed) — but this version runs server-side with the
 * service-role client and, unlike that function, is allowed to return
 * `business_id`, because it's never exposed to the browser.
 */
async function resolveWidgetForRuntime(
  publicWidgetId: string,
  originHeader: string | null
): Promise<ResolvedWidget> {
  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) return { status: 'unavailable' };

  const { data: business } = await supabase
    .from('businesses')
    .select('id, is_active, default_language')
    .eq('public_widget_id', publicWidgetId)
    .maybeSingle();

  if (!business) return { status: 'unknown' };
  const businessRow = business as BusinessLookupRow;

  const { data: widgetSettings } = await supabase
    .from('widget_settings')
    .select(
      'business_id, widget_enabled, allowed_origins, welcome_message_en, welcome_message_me, welcome_message_ru, human_handoff_enabled'
    )
    .eq('business_id', businessRow.id)
    .maybeSingle();

  if (!widgetSettings) return { status: 'unknown' };
  const widgetRow = widgetSettings as WidgetSettingsLookupRow;

  if (!isOriginAllowed(originHeader, widgetRow.allowed_origins)) {
    return { status: 'origin_denied' };
  }

  if (!businessRow.is_active || !widgetRow.widget_enabled) {
    return { status: 'disabled' };
  }

  return {
    status: 'ok',
    businessId: businessRow.id,
    defaultLanguage: businessRow.default_language,
    welcomeMessageEn: widgetRow.welcome_message_en,
    welcomeMessageMe: widgetRow.welcome_message_me,
    welcomeMessageRu: widgetRow.welcome_message_ru,
    humanHandoffEnabled: widgetRow.human_handoff_enabled
  };
}

function welcomeMessageFor(widget: Extract<ResolvedWidget, { status: 'ok' }>, language: string) {
  if (language === 'me' && widget.welcomeMessageMe) return widget.welcomeMessageMe;
  if (language === 'ru' && widget.welcomeMessageRu) return widget.welcomeMessageRu;
  return widget.welcomeMessageEn ?? 'Hi! How can we help you today?';
}

/**
 * A previously-issued token is only ever honored to resume a
 * conversation when every claim it carries agrees with the current
 * request's own fields — never partial agreement. Deliberately does
 * NOT check a `businessId` claim: the token never carries one (see
 * session-token.ts's doc comment) — `businessId` for the actual
 * conversation lookup always comes from this request's own freshly
 * resolved widget, never from anything the token or the browser
 * supplied. Any mismatch (or no token/conversationId at all) means
 * "not a valid resume", handled by starting a fresh conversation
 * instead of erroring.
 */
function tokenMatchesResumeRequest(
  claims: ReturnType<typeof verifyWidgetSessionToken>,
  params: { publicWidgetId: string; conversationId: string; visitorId: string }
): boolean {
  if (!claims) return false;
  return (
    claims.publicWidgetId === params.publicWidgetId &&
    claims.conversationId === params.conversationId &&
    claims.visitorId === params.visitorId
  );
}

export type SessionResult =
  | { status: 'unknown' }
  | { status: 'origin_denied' }
  | { status: 'disabled' }
  | { status: 'unavailable' }
  | { status: 'ok'; conversationId: string; sessionToken: string; messages: RuntimeMessage[] };

export async function startOrContinueSession(params: {
  publicWidgetId: string;
  visitorId: string;
  language?: string;
  conversationId?: string;
  sessionToken?: string;
  originHeader: string | null;
}): Promise<SessionResult> {
  const widget = await resolveWidgetForRuntime(params.publicWidgetId, params.originHeader);
  if (widget.status !== 'ok') return widget;

  // Fail closed before any conversation is created or written — never
  // spend a database write only to discover afterward that no token
  // could be issued for it.
  if (!isWidgetSessionSigningConfigured()) return { status: 'unavailable' };

  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) return { status: 'unavailable' };

  const language = params.language ?? widget.defaultLanguage;

  if (params.conversationId) {
    const claims = verifyWidgetSessionToken(params.sessionToken);
    const isValidResume = tokenMatchesResumeRequest(claims, {
      publicWidgetId: params.publicWidgetId,
      conversationId: params.conversationId,
      visitorId: params.visitorId
    });

    if (isValidResume) {
      // widget.businessId — resolved fresh, above, from publicWidgetId —
      // is the only source of businessId for this lookup. The token
      // never carries one.
      const existing = await loadOwnConversation(
        supabase,
        widget.businessId,
        params.conversationId,
        params.visitorId
      );
      if (existing) {
        const token = issueWidgetSessionToken({
          publicWidgetId: params.publicWidgetId,
          conversationId: existing.id,
          visitorId: params.visitorId
        });
        if (!token) return { status: 'unavailable' };

        const messages = await loadMessages(supabase, existing.id);
        return { status: 'ok', conversationId: existing.id, sessionToken: token, messages };
      }
    }
    // No token, an invalid/mismatched token, or a conversation id that
    // doesn't actually belong to this business+visitor (unknown, stale,
    // or — in the malicious case — guessed/borrowed from someone else).
    // Never resume without full agreement; start a fresh conversation
    // instead of erroring, exactly like a first-time visitor.
  }

  const { data: created, error } = await supabase
    .from('conversations')
    .insert({
      business_id: widget.businessId,
      visitor_id: params.visitorId,
      channel: 'website',
      detected_language: language,
      status: 'open',
      human_takeover: false,
      lead_created: false,
      flow_state: {}
    })
    .select('id')
    .single();

  if (error || !created) return { status: 'unavailable' };
  const conversationId = (created as { id: string }).id;

  const token = issueWidgetSessionToken({
    publicWidgetId: params.publicWidgetId,
    conversationId,
    visitorId: params.visitorId
  });
  if (!token) return { status: 'unavailable' };

  const welcomeText = welcomeMessageFor(widget, language);
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    role: 'assistant',
    content: welcomeText
  });

  return {
    status: 'ok',
    conversationId,
    sessionToken: token,
    messages: [{ role: 'assistant', text: welcomeText }]
  };
}

export type MessageResult =
  | { status: 'unknown' }
  | { status: 'origin_denied' }
  | { status: 'disabled' }
  | { status: 'unavailable' }
  | { status: 'unauthorized' }
  | { status: 'ok'; messages: RuntimeMessage[] };

/**
 * Every failure path here — an unknown/expired/tampered token, a token
 * whose claims don't match this request's own fields, or a
 * conversation that doesn't actually belong to this business+visitor —
 * returns the exact same `'unauthorized'` result. The route handler
 * turns that into one generic response; a caller can never learn which
 * of those was true, including whether the conversation id exists at
 * all.
 */
export async function postMessage(params: {
  publicWidgetId: string;
  visitorId: string;
  conversationId: string;
  message: string;
  sessionToken: string;
  originHeader: string | null;
}): Promise<MessageResult> {
  const widget = await resolveWidgetForRuntime(params.publicWidgetId, params.originHeader);
  if (widget.status !== 'ok') return widget;

  if (!isWidgetSessionSigningConfigured()) return { status: 'unavailable' };

  const claims = verifyWidgetSessionToken(params.sessionToken);
  const isAuthorized = tokenMatchesResumeRequest(claims, {
    publicWidgetId: params.publicWidgetId,
    conversationId: params.conversationId,
    visitorId: params.visitorId
  });
  if (!isAuthorized) return { status: 'unauthorized' };

  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) return { status: 'unavailable' };

  // widget.businessId — resolved fresh, above, from publicWidgetId — is
  // the only source of businessId for this lookup. The token never
  // carries one; conversation_id + this resolved business_id +
  // visitor_id together are what authorize the read/write.
  const conversation = await loadOwnConversation(
    supabase,
    widget.businessId,
    params.conversationId,
    params.visitorId
  );
  if (!conversation) return { status: 'unauthorized' };

  await supabase.from('messages').insert({
    conversation_id: conversation.id,
    role: 'user',
    content: params.message
  });

  // Human takeover means an owner is already replying from the Inbox —
  // never let the automated reply engine talk over them.
  if (conversation.human_takeover) {
    return { status: 'ok', messages: [] };
  }

  // A pending handoff request (submitted, not yet accepted or
  // resolved — see submitHandoffRequest() below) means a visitor
  // already asked for a person; the one acknowledgement message that
  // request creates is the AI's only reply here — it must not
  // continue answering as if that request never happened. Once the
  // handoff is resolved (or the owner takes over, already covered by
  // human_takeover above), normal replies resume.
  const { data: activeHandoff } = await supabase
    .from('handoffs')
    .select('id')
    .eq('conversation_id', conversation.id)
    .neq('status', 'resolved')
    .limit(1)
    .maybeSingle();
  if (activeHandoff) {
    return { status: 'ok', messages: [] };
  }

  const replyText = await generateKnowledgeReply(
    supabase,
    widget.businessId,
    params.message,
    conversation.detected_language
  );

  await supabase.from('messages').insert({
    conversation_id: conversation.id,
    role: 'assistant',
    content: replyText
  });

  return { status: 'ok', messages: [{ role: 'assistant', text: replyText }] };
}

/** Confirms `conversationId` belongs to both `businessId` (the server-resolved one, never browser-supplied) AND `visitorId` before reading or writing anything scoped to it — a conversation id alone (even under the right business) is never sufficient; this is the actual cross-visitor isolation boundary, on top of the session-token check callers also perform. */
async function loadOwnConversation(
  supabase: SupabaseClient,
  businessId: string,
  conversationId: string,
  visitorId: string
): Promise<Pick<ConversationRow, 'id' | 'detected_language' | 'human_takeover'> | null> {
  const { data } = await supabase
    .from('conversations')
    .select('id, detected_language, human_takeover')
    .eq('business_id', businessId)
    .eq('id', conversationId)
    .eq('visitor_id', visitorId)
    .maybeSingle();

  return (
    (data as Pick<ConversationRow, 'id' | 'detected_language' | 'human_takeover'> | null) ?? null
  );
}

async function loadMessages(
  supabase: SupabaseClient,
  conversationId: string
): Promise<RuntimeMessage[]> {
  const { data } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  return ((data as Pick<MessageRow, 'role' | 'content'>[] | null) ?? [])
    .filter((row) => row.role === 'user' || row.role === 'assistant')
    .map((row) => ({ role: row.role as 'user' | 'assistant', text: row.content }));
}

/** Postgres unique_violation — same constant/handling as messages.client_message_id's own duplicate-submit guard in src/features/inbox/api/service.ts's sendHumanReply(). */
const UNIQUE_VIOLATION = '23505';

const HANDOFF_ACKNOWLEDGEMENT_TEXT =
  "Thanks — we've let the team know and someone will be in touch with you shortly.";

/** `HO-<base36 timestamp><4 random base36 chars>` — a short, human-scannable reference, not a security token; leads.reference has no known uniqueness requirement this needs to defend against beyond "very unlikely to collide". */
function generateLeadReference(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const randomSuffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `HO-${timestamp}${randomSuffix}`;
}

export type HandoffRequestResult =
  | { status: 'unknown' }
  | { status: 'origin_denied' }
  | { status: 'disabled' }
  | { status: 'unavailable' }
  | { status: 'unauthorized' }
  | { status: 'ok' };

/**
 * The visitor-facing "Talk to a person" contact form's submit handler
 * (POST /api/public-widget/handoff) — mirrors postMessage()'s own
 * resolve → sign-check → authorize → load-own-conversation sequence
 * exactly, then does three additional things postMessage() doesn't:
 *
 *  1. Confirms `human_handoff_enabled` server-side — never trusts the
 *     widget UI's own decision to show or hide the "Talk to a person"
 *     action.
 *  2. Is idempotent on `clientRequestId` (see
 *     supabase/migrations/20260918090000_handoff_idempotency.sql): a
 *     retried/replayed submission returns the same 'ok' result without
 *     writing anything a second time.
 *  3. Creates or updates exactly one `leads` row and inserts exactly
 *     one `handoffs` row for this conversation, marks the conversation
 *     `status = 'handed_off'` (an existing, previously-unused
 *     ConversationStatus value — see database.types.ts) and
 *     `lead_created = true`, and inserts ONE acknowledgement message
 *     directly — never through generateKnowledgeReply(), which this
 *     feature does not modify.
 *
 * Every field the caller supplies has already passed
 * `publicWidgetHandoffRequestSchema` (including its cross-field
 * email/phone `.superRefine()`) before this runs — this function still
 * re-sanitizes name/message (defense in depth, and consistent with
 * every other write path in this app trusting only its own
 * validation, never a caller's).
 */
export async function submitHandoffRequest(params: {
  publicWidgetId: string;
  visitorId: string;
  conversationId: string;
  sessionToken: string;
  clientRequestId: string;
  name: string;
  email?: string;
  phone?: string;
  message?: string;
  originHeader: string | null;
}): Promise<HandoffRequestResult> {
  const widget = await resolveWidgetForRuntime(params.publicWidgetId, params.originHeader);
  if (widget.status !== 'ok') return widget;
  if (!widget.humanHandoffEnabled) return { status: 'disabled' };

  if (!isWidgetSessionSigningConfigured()) return { status: 'unavailable' };

  const claims = verifyWidgetSessionToken(params.sessionToken);
  const isAuthorized = tokenMatchesResumeRequest(claims, {
    publicWidgetId: params.publicWidgetId,
    conversationId: params.conversationId,
    visitorId: params.visitorId
  });
  if (!isAuthorized) return { status: 'unauthorized' };

  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) return { status: 'unavailable' };

  const conversation = await loadOwnConversation(
    supabase,
    widget.businessId,
    params.conversationId,
    params.visitorId
  );
  if (!conversation) return { status: 'unauthorized' };

  // Idempotency: a retried/replayed submission with the same
  // clientRequestId returns success without writing anything again —
  // checked up front so a retry never re-creates the lead, re-inserts
  // the handoff, or re-sends the acknowledgement message.
  const { data: existingHandoff } = await supabase
    .from('handoffs')
    .select('id')
    .eq('client_request_id', params.clientRequestId)
    .maybeSingle();
  if (existingHandoff) return { status: 'ok' };

  const name = sanitizeFreeText(params.name, HANDOFF_NAME_MAX_LENGTH);
  const email = params.email?.trim() ?? '';
  const phone = params.phone?.trim() ?? '';
  const contactLine = buildContactLine(email, phone);
  const message = params.message
    ? sanitizeFreeText(params.message, HANDOFF_MESSAGE_MAX_LENGTH)
    : '';

  // Lead: create or update, scoped to this conversation — never a
  // second lead row for the same conversation's handoff request.
  const { data: existingLead } = await supabase
    .from('leads')
    .select('id')
    .eq('business_id', widget.businessId)
    .eq('conversation_id', params.conversationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const leadFields = {
    name,
    contact: contactLine,
    note: message || null,
    language: conversation.detected_language,
    source: 'website' as const,
    consent_at: new Date().toISOString()
  };

  if (existingLead) {
    await supabase
      .from('leads')
      .update(leadFields)
      .eq('id', (existingLead as { id: string }).id);
  } else {
    await supabase.from('leads').insert({
      ...leadFields,
      business_id: widget.businessId,
      conversation_id: params.conversationId,
      reference: generateLeadReference(),
      status: 'new'
    });
  }

  // Handoff: insert, relying on the unique index on client_request_id
  // (partial — see the migration) to catch a genuine race against an
  // identical concurrent submission that slipped past the existence
  // check above.
  const { error: handoffError } = await supabase.from('handoffs').insert({
    business_id: widget.businessId,
    conversation_id: params.conversationId,
    customer_name: name,
    contact: contactLine,
    question: message || null,
    status: 'new',
    client_request_id: params.clientRequestId
  });

  if (handoffError) {
    if (handoffError.code === UNIQUE_VIOLATION) {
      // Lost the race to an identical concurrent request — it already
      // created everything below; this is still a success from the
      // caller's point of view.
      return { status: 'ok' };
    }
    return { status: 'unavailable' };
  }

  // 'handed_off' is an existing ConversationStatus value (see
  // database.types.ts) that, before this feature, nothing ever set —
  // it now means exactly what its name says: needs human attention,
  // requested but not yet accepted (see takeOverConversation() in
  // src/features/inbox/api/service.ts for what happens once an owner
  // does accept it).
  await supabase
    .from('conversations')
    .update({ status: 'handed_off', lead_created: true })
    .eq('id', params.conversationId);

  // One acknowledgement, inserted directly — never routed through
  // generateKnowledgeReply(), which stays untouched. This is the "AI
  // may send one acknowledgement but should not continue pretending to
  // be a human" behavior; postMessage()'s own active-handoff check
  // (above) is what stops any further automated reply after this.
  await supabase.from('messages').insert({
    conversation_id: params.conversationId,
    role: 'assistant',
    content: HANDOFF_ACKNOWLEDGEMENT_TEXT
  });

  return { status: 'ok' };
}
