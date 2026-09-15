-- Knowledge Base: authenticated-owner RLS policies for public.knowledge_items.
--
-- A live check of this Supabase project (`select policyname, cmd, roles
-- from pg_policies where schemaname = 'public' and tablename =
-- 'knowledge_items';`) returned zero rows — knowledge_items has RLS
-- enabled but currently NO policies at all, so every request (including
-- the platform's own owner-authenticated dashboard) is denied by
-- default. The earlier assumption that SELECT/UPDATE/DELETE owner
-- policies already existed was wrong; this migration creates all four.
--
-- Policy names and ownership shape are taken from ChatbotDemo's own
-- original design for this table (see ChatbotDemo's
-- supabase/migrations/20260201000200_row_level_security.sql:
-- knowledge_items_select_own / _insert_own / _update_own / _delete_own),
-- which this migration intentionally reuses so the platform and
-- ChatbotDemo agree on one canonical policy set for knowledge_items
-- rather than each maintaining a divergent one.
--
-- One addition over ChatbotDemo's original text: each policy here is
-- scoped `to authenticated` (ChatbotDemo's originals had no `to` clause,
-- so they applied to `public`/all roles, relying only on auth.uid()
-- being null for anon to stay safe). Restricting `to authenticated` is a
-- stricter, behavior-preserving superset — ChatbotDemo's own widget
-- never talks to knowledge_items as anon (per that migration's header
-- comment: the public widget goes through service-role Route Handlers,
-- which bypass RLS entirely), so nothing that currently relies on an
-- anon policy on this table can exist to break.
--
-- Additive and rerun-safe: `drop policy if exists` precedes every
-- `create policy` below, using the exact same four policy names in both
-- this app and ChatbotDemo, so running this migration repeatedly (or
-- alongside ChatbotDemo's own migration, whichever applies last) always
-- converges on the same four policies rather than accumulating
-- duplicates. Does not modify, drop, or recreate any table, column,
-- trigger, or function, and does not touch any other table.
--
-- Ownership check, identical across all four policies: a row is only
-- reachable when its business_id points to a public.businesses row whose
-- owner_id equals the caller's auth.uid() — no policy below is ever
-- given an unconditional true predicate.

drop policy if exists "knowledge_items_select_own" on public.knowledge_items;
drop policy if exists "knowledge_items_insert_own" on public.knowledge_items;
drop policy if exists "knowledge_items_update_own" on public.knowledge_items;
drop policy if exists "knowledge_items_delete_own" on public.knowledge_items;

-- Also drop the differently-named insert policy from this migration's
-- prior revision, in case that earlier version was ever applied to this
-- database — keeps this migration rerun-safe regardless of which
-- revision ran last.
drop policy if exists "knowledge_items_insert_owner" on public.knowledge_items;

create policy "knowledge_items_select_own"
  on public.knowledge_items
  for select
  to authenticated
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.businesses b
      where b.id = knowledge_items.business_id
        and b.owner_id = auth.uid()
    )
  );

create policy "knowledge_items_insert_own"
  on public.knowledge_items
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and exists (
      select 1
      from public.businesses b
      where b.id = knowledge_items.business_id
        and b.owner_id = auth.uid()
    )
  );

create policy "knowledge_items_update_own"
  on public.knowledge_items
  for update
  to authenticated
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.businesses b
      where b.id = knowledge_items.business_id
        and b.owner_id = auth.uid()
    )
  )
  with check (
    auth.uid() is not null
    and exists (
      select 1
      from public.businesses b
      where b.id = knowledge_items.business_id
        and b.owner_id = auth.uid()
    )
  );

create policy "knowledge_items_delete_own"
  on public.knowledge_items
  for delete
  to authenticated
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.businesses b
      where b.id = knowledge_items.business_id
        and b.owner_id = auth.uid()
    )
  );
