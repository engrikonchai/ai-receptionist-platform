-- Inbox human replies: lets an authenticated business owner insert a
-- reply into their own business's conversations from the
-- ai-receptionist-platform Inbox.
--
-- Additive and rerun-safe: only adds two nullable columns (guarded by
-- `if not exists`), one check constraint (guarded by an existence
-- check), one partial unique index (`if not exists`), and one INSERT
-- policy (`drop policy if exists` before `create policy`) to the
-- existing public.messages table. Does not modify, drop, or recreate
-- any existing table, column, trigger, function, or SELECT/UPDATE/
-- DELETE policy, and does not touch any other table. Safe to run more
-- than once.
--
-- Role model is unchanged from ChatbotDemo's own
-- (messages.role check constraint: 'user' | 'assistant' | 'system').
-- A human reply is still written as role = 'assistant' — visitors, the
-- widget, and ChatbotDemo's own chat engine never need to know who
-- authored an assistant-role message. sender_type only disambiguates
-- AI vs human *within* role = 'assistant', purely for the Inbox UI's
-- own labelling.

-- 1. sender_type: null (existing/AI rows) or 'human' (Inbox replies).
--    'ai' is allowed for explicitness but never required — the app
--    never insists on it being set for AI-authored rows.
alter table public.messages
  add column if not exists sender_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'messages_sender_type_check'
  ) then
    alter table public.messages
      add constraint messages_sender_type_check
      check (sender_type is null or sender_type in ('ai', 'human'));
  end if;
end $$;

comment on column public.messages.sender_type is
  'Set by ai-receptionist-platform. Disambiguates who authored a role=assistant message: null or ''ai'' means the AI receptionist (null covers every row written before this column existed, and every row ChatbotDemo''s own mock AI engine writes), ''human'' means a business owner replied from the Inbox. Never set for role=user or role=system rows.';

-- 2. client_message_id: a UUID the Inbox composer generates once per
--    send attempt and resends unchanged on retry, so re-submitting a
--    still-in-flight or already-succeeded send (a double-click, a
--    dropped response) can never insert a second row. The partial
--    unique index only constrains rows that set this column, so it
--    never affects ChatbotDemo's own inserts (which never set it) or
--    any pre-existing row (all null).
alter table public.messages
  add column if not exists client_message_id uuid;

create unique index if not exists messages_client_message_id_key
  on public.messages (client_message_id)
  where client_message_id is not null;

comment on column public.messages.client_message_id is
  'Set by ai-receptionist-platform''s Inbox composer to make sendHumanReply() retry-safe. Null for every row ChatbotDemo''s own chat engine inserts.';

-- 3. Owner-scoped INSERT policy. A signed-in business owner may insert
--    exactly one shape of row: role='assistant', sender_type='human',
--    into a conversation belonging to one of their own businesses.
--    - `to authenticated` (never anon/public) plus an explicit
--      `auth.uid() is not null` guard means this policy can never match
--      an unauthenticated request.
--    - The `exists` subquery joins conversations -> businesses and
--      requires businesses.owner_id = auth.uid(), so a conversation id
--      from a business the caller doesn't own can never pass, and RLS
--      on conversations/businesses (unchanged by this migration)
--      already scopes what the subquery itself can see.
--    - Requiring role='assistant' means this policy can never be used
--      to insert a role='user' (visitor) message — that only ever
--      happens through ChatbotDemo's own server-side chat engine, on
--      its own trusted path, untouched by this migration.
--    - Never widens who can select, update, or delete from messages —
--      only adds this one new insert path.
--    - `drop policy if exists` first makes this rerun-safe.
drop policy if exists "messages_insert_owner_human_reply" on public.messages;

create policy "messages_insert_owner_human_reply"
  on public.messages
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and role = 'assistant'
    and sender_type = 'human'
    and exists (
      select 1
      from public.conversations c
      join public.businesses b on b.id = c.business_id
      where c.id = messages.conversation_id
        and b.owner_id = auth.uid()
    )
  );
