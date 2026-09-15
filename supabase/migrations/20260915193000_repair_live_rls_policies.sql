-- Repair live RLS policies: a live audit of this Supabase project found
-- the original ChatbotDemo RLS migration
-- (supabase/migrations/20260201000200_row_level_security.sql, in the
-- ChatbotDemo repo) stopped partway after hitting a duplicate-policy
-- error, leaving most tables with RLS enabled but NO owner policies at
-- all. Live policy counts at time of audit:
--
--   businesses: 0   conversations: 0   handoffs: 0
--   knowledge_items: 4 (already repaired — see
--     20260915184700_knowledge_items_owner_policies.sql, untouched here)
--   leads: 0
--   messages: 1 (messages_insert_owner_human_reply only — see
--     20260915170200_inbox_human_replies.sql, untouched here)
--   profiles: 3 (2 expected — profiles_select_own, profiles_update_own —
--     plus one extra, inferred by this app's naming convention to be
--     profiles_insert_own; see the note below)
--   widget_settings: 0
--
-- This migration creates every missing owner policy the original
-- migration should have created, using the exact same policy names and
-- ownership shape ChatbotDemo's own migration defines, restricted to
-- `to authenticated` with an explicit `auth.uid() is not null` guard
-- (the same, stricter-but-compatible upgrade already applied to
-- knowledge_items and messages_insert_owner_human_reply — ChatbotDemo's
-- own public widget never talks to any of these tables as anon; it
-- writes only through service-role Route Handlers, so nothing here can
-- break it).
--
-- profiles_insert_own: not created here, and dropped if present. Every
-- profile row is created exclusively by ChatbotDemo's `handle_new_user`
-- trigger (security definer, fires on auth.users insert — see
-- ChatbotDemo's supabase/migrations/20260201000300_onboarding.sql),
-- which bypasses RLS entirely and therefore never needed an INSERT
-- policy to begin with. Neither ChatbotDemo's original migration nor
-- any platform migration defines or requires profiles_insert_own, and
-- no application code in either repo ever inserts a profiles row as the
-- authenticated user — an owner-authenticated INSERT path onto profiles
-- would only be an unused, unintended attack surface (letting a signed-
-- in user insert an arbitrary extra profile row). Note: the live audit
-- reports only a policy *count* per table, not names, so "3 on
-- profiles" is confirmed, but the identity of the third policy as
-- specifically "profiles_insert_own" is inferred from this codebase's
-- own `<table>_insert_own` naming convention (businesses_insert_own,
-- leads_insert_own, knowledge_items_insert_own) rather than read
-- directly off the database — verify with the query in this repo's PR
-- description before/after applying.
--
-- Deliberately NOT touched by this migration (drop-then-recreate would
-- still be safe, but every one of these already exists correctly, and
-- leaving their own migrations as the sole owner of their SQL keeps a
-- single source of truth per policy):
--   - knowledge_items_select_own / _insert_own / _update_own / _delete_own
--   - messages_insert_owner_human_reply
--
-- Deliberately NOT created (matches the original design exactly — see
-- the "no insert policy" comments in ChatbotDemo's own migration):
--   - conversations: no owner INSERT (only the service-role widget
--     routes create conversations)
--   - handoffs: no owner INSERT (only the service-role widget routes
--     create hand-offs)
--   - messages: no owner INSERT for visitor/AI messages (role='user' or
--     an AI-authored role='assistant' row) and no owner UPDATE at all —
--     the only owner-authenticated write path onto messages remains the
--     existing, narrowly-scoped messages_insert_owner_human_reply
--     (role='assistant' and sender_type='human')
--   - widget_settings: no owner INSERT or DELETE (the default row is
--     created by the onboarding trigger; the app never deletes it)
--   - profiles: no owner INSERT (see above) and no DELETE (never was
--     part of the original design)
--
-- Rerun-safe: `drop policy if exists` precedes every `create policy`
-- below, using the same policy names on every run, so running this
-- migration repeatedly always converges on the same policy set rather
-- than erroring or accumulating duplicates — this is exactly the
-- failure mode being repaired (the original migration had no such
-- guards and stopped on its first duplicate).
--
-- Does not modify, drop, or recreate any table, column, constraint,
-- trigger, or function, does not disable RLS anywhere, and never grants
-- the anon or public role any access — every policy below is `to
-- authenticated` only, with an explicit `auth.uid() is not null` guard,
-- and no policy is ever given an unconditional true predicate.

-- ---------------------------------------------------------------------
-- profiles — read/update own row only. No INSERT (the onboarding
-- trigger, security definer, creates every profile row and bypasses RLS
-- to do it) and no DELETE.
-- ---------------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;

create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (
    auth.uid() is not null
    and id = auth.uid()
  );

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (
    auth.uid() is not null
    and id = auth.uid()
  )
  with check (
    auth.uid() is not null
    and id = auth.uid()
  );

-- ---------------------------------------------------------------------
-- businesses — full CRUD, scoped to rows the owner actually owns.
-- ---------------------------------------------------------------------
drop policy if exists "businesses_select_own" on public.businesses;
drop policy if exists "businesses_insert_own" on public.businesses;
drop policy if exists "businesses_update_own" on public.businesses;
drop policy if exists "businesses_delete_own" on public.businesses;

create policy "businesses_select_own"
  on public.businesses
  for select
  to authenticated
  using (
    auth.uid() is not null
    and owner_id = auth.uid()
  );

create policy "businesses_insert_own"
  on public.businesses
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and owner_id = auth.uid()
  );

create policy "businesses_update_own"
  on public.businesses
  for update
  to authenticated
  using (
    auth.uid() is not null
    and owner_id = auth.uid()
  )
  with check (
    auth.uid() is not null
    and owner_id = auth.uid()
  );

create policy "businesses_delete_own"
  on public.businesses
  for delete
  to authenticated
  using (
    auth.uid() is not null
    and owner_id = auth.uid()
  );

-- ---------------------------------------------------------------------
-- conversations — scoped through the parent business. No owner INSERT:
-- conversations are only ever created by the service-role widget routes.
-- ---------------------------------------------------------------------
drop policy if exists "conversations_select_own" on public.conversations;
drop policy if exists "conversations_update_own" on public.conversations;
drop policy if exists "conversations_delete_own" on public.conversations;

create policy "conversations_select_own"
  on public.conversations
  for select
  to authenticated
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.businesses b
      where b.id = conversations.business_id
        and b.owner_id = auth.uid()
    )
  );

create policy "conversations_update_own"
  on public.conversations
  for update
  to authenticated
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.businesses b
      where b.id = conversations.business_id
        and b.owner_id = auth.uid()
    )
  )
  with check (
    auth.uid() is not null
    and exists (
      select 1
      from public.businesses b
      where b.id = conversations.business_id
        and b.owner_id = auth.uid()
    )
  );

create policy "conversations_delete_own"
  on public.conversations
  for delete
  to authenticated
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.businesses b
      where b.id = conversations.business_id
        and b.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- messages — SELECT and DELETE scoped through conversations -> the
-- parent business. No general owner UPDATE. No owner INSERT for
-- visitor/AI-authored rows — the only owner-authenticated write path
-- remains the existing messages_insert_owner_human_reply policy
-- (untouched by this migration; not dropped or recreated here).
-- ---------------------------------------------------------------------
drop policy if exists "messages_select_own" on public.messages;
drop policy if exists "messages_delete_own" on public.messages;

create policy "messages_select_own"
  on public.messages
  for select
  to authenticated
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.conversations c
      join public.businesses b on b.id = c.business_id
      where c.id = messages.conversation_id
        and b.owner_id = auth.uid()
    )
  );

create policy "messages_delete_own"
  on public.messages
  for delete
  to authenticated
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.conversations c
      join public.businesses b on b.id = c.business_id
      where c.id = messages.conversation_id
        and b.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- leads — full CRUD, scoped through the parent business.
-- ---------------------------------------------------------------------
drop policy if exists "leads_select_own" on public.leads;
drop policy if exists "leads_insert_own" on public.leads;
drop policy if exists "leads_update_own" on public.leads;
drop policy if exists "leads_delete_own" on public.leads;

create policy "leads_select_own"
  on public.leads
  for select
  to authenticated
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.businesses b
      where b.id = leads.business_id
        and b.owner_id = auth.uid()
    )
  );

create policy "leads_insert_own"
  on public.leads
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and exists (
      select 1
      from public.businesses b
      where b.id = leads.business_id
        and b.owner_id = auth.uid()
    )
  );

create policy "leads_update_own"
  on public.leads
  for update
  to authenticated
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.businesses b
      where b.id = leads.business_id
        and b.owner_id = auth.uid()
    )
  )
  with check (
    auth.uid() is not null
    and exists (
      select 1
      from public.businesses b
      where b.id = leads.business_id
        and b.owner_id = auth.uid()
    )
  );

create policy "leads_delete_own"
  on public.leads
  for delete
  to authenticated
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.businesses b
      where b.id = leads.business_id
        and b.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- handoffs — SELECT, UPDATE and DELETE, scoped through the parent
-- business. No owner INSERT: hand-offs are only ever created by the
-- service-role widget routes.
-- ---------------------------------------------------------------------
drop policy if exists "handoffs_select_own" on public.handoffs;
drop policy if exists "handoffs_update_own" on public.handoffs;
drop policy if exists "handoffs_delete_own" on public.handoffs;

create policy "handoffs_select_own"
  on public.handoffs
  for select
  to authenticated
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.businesses b
      where b.id = handoffs.business_id
        and b.owner_id = auth.uid()
    )
  );

create policy "handoffs_update_own"
  on public.handoffs
  for update
  to authenticated
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.businesses b
      where b.id = handoffs.business_id
        and b.owner_id = auth.uid()
    )
  )
  with check (
    auth.uid() is not null
    and exists (
      select 1
      from public.businesses b
      where b.id = handoffs.business_id
        and b.owner_id = auth.uid()
    )
  );

create policy "handoffs_delete_own"
  on public.handoffs
  for delete
  to authenticated
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.businesses b
      where b.id = handoffs.business_id
        and b.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- widget_settings — SELECT and UPDATE only, scoped through the parent
-- business. No owner INSERT (the default row is created by the
-- onboarding trigger) and no DELETE (the app never removes this row).
-- ---------------------------------------------------------------------
drop policy if exists "widget_settings_select_own" on public.widget_settings;
drop policy if exists "widget_settings_update_own" on public.widget_settings;

create policy "widget_settings_select_own"
  on public.widget_settings
  for select
  to authenticated
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.businesses b
      where b.id = widget_settings.business_id
        and b.owner_id = auth.uid()
    )
  );

create policy "widget_settings_update_own"
  on public.widget_settings
  for update
  to authenticated
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.businesses b
      where b.id = widget_settings.business_id
        and b.owner_id = auth.uid()
    )
  )
  with check (
    auth.uid() is not null
    and exists (
      select 1
      from public.businesses b
      where b.id = widget_settings.business_id
        and b.owner_id = auth.uid()
    )
  );
