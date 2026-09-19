-- Enforce the V1 product rule at the database level: one authenticated
-- owner account owns exactly one business. Every different
-- customer/company signs up its own separate account instead, and that
-- business's Knowledge Base, widget, conversations, leads, handoffs and
-- Paddle subscription are all already scoped to it alone (business_id/
-- owner_id foreign keys + RLS) — this migration only closes the one gap
-- in that shape: nothing before this stopped a single owner_id from
-- being attached to more than one businesses row. Multi-business
-- ownership (one owner, several businesses, with switching between
-- them) is explicitly out of scope for V1 and would need its own
-- future migration to relax this constraint deliberately, not an
-- accidental gap in this one.
--
-- Additive and rerun-safe: adds one partial unique index, guarded by
-- `if not exists`, and touches nothing else. Does not create, drop, or
-- alter any table, column, trigger, function, RLS policy, or grant, and
-- does not disable Row Level Security anywhere (RLS on public.businesses
-- is untouched and stays enabled). In particular, this migration does
-- NOT touch the `businesses_insert_own` policy (see
-- supabase/migrations/20260915193000_repair_live_rls_policies.sql) —
-- that policy already correctly scopes INSERT to `owner_id = auth.uid()`
-- and is left exactly as-is; the new unique index below is what turns a
-- second INSERT attempt by the same owner into a rejected, unique-
-- violation write instead of a silently-allowed second business. It
-- also does not touch ChatbotDemo's own `handle_new_user` signup
-- trigger (a different repo/migration — see
-- supabase/migrations/20260915000100_platform_onboarding.sql's own doc
-- comment), which creates exactly one business per new signup and so
-- already satisfies this constraint by construction; this migration
-- only guards against a second, additional business being created
-- afterward. Safe to run more than once.
--
-- Pre-check: a duplicate owner_id (more than one business row already
-- owned by the same owner) would make the unique index below impossible
-- to create. Checked explicitly first, raising a clear exception that
-- identifies only the affected owner UUID(s) and how many businesses
-- each owns — never a business id, name, or any other row data — and
-- never deleting, merging, or otherwise modifying any row itself.
-- Resolving a real duplicate (archiving/reassigning the extra rows) is
-- a deliberate, separate, verified follow-up migration, not something
-- this file does automatically.
do $$
declare
  v_dupe_owner_count integer;
  v_dupe_summary text;
begin
  select count(*), string_agg(format('%s (%s businesses)', dupes.owner_id, dupes.cnt), '; ' order by dupes.owner_id)
  into v_dupe_owner_count, v_dupe_summary
  from (
    select owner_id, count(*) as cnt
    from public.businesses
    where owner_id is not null
    group by owner_id
    having count(*) > 1
  ) dupes;

  if v_dupe_owner_count > 0 then
    raise exception
      'businesses has % owner_id(s) that already own more than one business, which the V1 single-business-per-owner rule forbids: %. This migration does not delete or merge any row. Resolve each affected owner''s extra business row(s) in a verified, explicit follow-up migration (e.g. archiving or reassigning) before rerunning this migration.',
      v_dupe_owner_count, v_dupe_summary;
  end if;
end $$;

-- Partial (owner_id is not null) rather than a plain column-level
-- UNIQUE constraint purely for self-documentation: Postgres already
-- treats every NULL as distinct from every other NULL in either form,
-- so a business row with no owner yet (if one is ever created) is never
-- blocked by this index — only a second non-null owner_id match is.
create unique index if not exists businesses_owner_id_key
  on public.businesses (owner_id)
  where owner_id is not null;

comment on index public.businesses_owner_id_key is
  'V1 product rule: one owner account owns exactly one business (owner_id is unique among non-null values). Added by supabase/migrations/20260921090000_single_business_per_owner.sql. Multi-business ownership is out of scope for V1 — relaxing or replacing this index to support it requires an explicit, deliberate future migration, not an ad hoc drop.';
