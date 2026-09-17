-- Lead capture / human handoff: an idempotency key for the public
-- widget's new POST /api/public-widget/handoff endpoint
-- (src/app/api/public-widget/runtime.ts's submitHandoffRequest()).
--
-- Every other write this feature makes reuses existing columns as-is
-- (leads.*, handoffs.customer_name/contact/question/status,
-- conversations.status='handed_off'/human_takeover) — see this
-- branch's PR report for the full mapping. This one column is the
-- exception, and only because there is no existing way to make "the
-- visitor's browser retried this exact submission" safe to detect:
--
--   - A double-click, a network timeout-then-retry, or a duplicate
--     replayed request must never create two handoff rows (and two
--     "someone wants to talk to you" notifications for the owner) for
--     what was really one visitor action.
--   - (business_id, conversation_id) is NOT a safe uniqueness key on
--     its own: a business-wide unique-active-handoff-per-conversation
--     rule is a real product constraint this migration does not want
--     to bake into a hard schema constraint (a resolved handoff should
--     be able to reopen with a fresh one later), so the actual
--     "already handled" check stays in application code
--     (submitHandoffRequest() looks for a non-resolved handoff on the
--     same conversation first).
--   - What DOES need a hard, atomic, database-level guarantee is
--     "this exact client-generated submission id was already
--     processed" — exactly the same problem
--     messages.client_message_id already solved for the Inbox's human-
--     reply composer (see
--     supabase/migrations/20260915170200_inbox_human_replies.sql) and
--     the identical `23505` unique-violation-then-fetch-existing
--     pattern in src/features/inbox/api/service.ts's sendHumanReply().
--     This column and its index are that same, already-proven pattern,
--     applied to handoffs.
--
-- Additive and rerun-safe: only adds one nullable column and one
-- partial unique index, both guarded by `if not exists`. Does not
-- modify, drop, or recreate any existing table, column, policy,
-- trigger, or function, and does not touch any other table. Safe to
-- run more than once.
--
-- The index is partial (`where client_request_id is not null`) so
-- every handoff row created any other way (there is none today, since
-- only this new endpoint ever inserts into handoffs — see
-- supabase/migrations/20260915193000_repair_live_rls_policies.sql's
-- own note that handoffs has no owner-authenticated INSERT policy) is
-- completely unaffected: any number of NULL values coexist safely,
-- and only an actual duplicate non-null id is ever rejected.
--
-- RLS: no new policy needed. The new column is covered by the existing
-- handoffs_select_own / _update_own policies for the owner-facing
-- side, and every INSERT that sets it runs through the service-role
-- client (src/lib/supabase/service-role.ts), which bypasses RLS
-- entirely — the same trust boundary every other public-widget write
-- to conversations/messages/leads/handoffs already uses.

alter table public.handoffs
  add column if not exists client_request_id text;

create unique index if not exists handoffs_client_request_id_key
  on public.handoffs (client_request_id)
  where client_request_id is not null;

comment on column public.handoffs.client_request_id is
  'Client-generated idempotency key for a visitor-submitted handoff request (see src/lib/public-widget/runtime.ts''s submitHandoffRequest()). Null for any handoff row created another way. A replayed request with the same id returns the existing row instead of inserting a duplicate.';
