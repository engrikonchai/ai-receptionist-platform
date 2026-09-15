-- Knowledge Base: lets an authenticated business owner insert new
-- public.knowledge_items rows for their own business from the
-- ai-receptionist-platform Knowledge page.
--
-- Additive and rerun-safe: adds exactly one INSERT policy
-- (`drop policy if exists` before `create policy`) to the existing
-- public.knowledge_items table. Does not modify, drop, or recreate any
-- existing table, column, trigger, function, or SELECT/UPDATE/DELETE
-- policy, and does not touch any other table. Safe to run more than
-- once.
--
-- knowledge_items already has SELECT, UPDATE and DELETE policies
-- scoped to the owning business (see ChatbotDemo's own RLS
-- migrations) — this adds the one missing piece: an owner INSERT
-- path, following the exact same ownership-join shape already used by
-- this app's own additive policy for messages (see
-- supabase/migrations/20260915170200_inbox_human_replies.sql).
--
-- - `to authenticated` (never anon/public) plus an explicit
--   `auth.uid() is not null` guard means this policy can never match
--   an unauthenticated request.
-- - The `exists` subquery requires businesses.owner_id = auth.uid(),
--   so a business id belonging to another owner can never pass, and
--   RLS on businesses (unchanged by this migration) already scopes
--   what the subquery itself can see.
-- - Never `using (true)` or `with check (true)` — every insert must
--   satisfy the ownership check above.
-- - Never widens who can select, update, or delete from
--   knowledge_items — only adds this one new insert path.

drop policy if exists "knowledge_items_insert_owner" on public.knowledge_items;

create policy "knowledge_items_insert_owner"
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
