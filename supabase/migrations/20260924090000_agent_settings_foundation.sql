-- Agent configuration foundation: a single agent_settings row per
-- business, holding only future-facing AI *behavioral* configuration
-- (tone, response length, custom instructions). This migration does not
-- add any AI provider, model, API key, or system-prompt internals — no
-- real reply engine reads this table yet. It exists purely as the
-- owner-facing configuration surface a future real AI reply engine will
-- consume.
--
-- FIELD-OWNERSHIP AUDIT (read before ever adding a column here): every
-- other owner-facing setting already has an authoritative home elsewhere
-- in this schema, and this migration deliberately does not duplicate any
-- of it:
--   - public widget/assistant display name -> widget_settings.title
--   - welcome messages                     -> widget_settings.welcome_message_{en,me,ru}
--   - widget color/position/install/origins -> widget_settings.{primary_color,position,allowed_origins,installation_confirmed*}
--   - human hand-off enablement/contact    -> widget_settings.human_handoff_enabled + businesses.handoff_email
--   - business identity/location/languages -> businesses.{name,business_type,location,default_language,supported_languages}
--   - knowledge content                    -> knowledge_items
--   - billing/subscription state           -> business_subscriptions
-- agent_settings owns exactly three columns beyond its own identity/
-- timestamps: tone, response_length, custom_instructions. Nothing else.
--
-- OWNERSHIP CHAIN: identical to every other business-scoped table in
-- this schema -- agent_settings.business_id -> businesses.id ->
-- businesses.owner_id -> auth.uid() (never a client-supplied owner id).
--
-- PROVISIONING: existing businesses are backfilled exactly once, rerun-
-- safe via `on conflict (business_id) do nothing`. Future businesses are
-- provisioned by a small, dedicated AFTER INSERT trigger on
-- public.businesses -- not by rewriting the already-sensitive
-- on_auth_user_created / handle_new_user() signup trigger
-- (supabase/migrations/20260922090000_self_contained_user_provisioning.sql)
-- solely to add this one row. Because that function's own step 2 already
-- performs a real `insert into public.businesses (...)`, this new
-- trigger fires automatically on every future signup too -- no change to
-- handle_new_user() itself, and no risk of touching its already-audited
-- atomicity/idempotency/concurrency guarantees.
--
-- GRANTS: like every other plain owner-scoped table in this schema
-- (businesses, widget_settings, knowledge_items -- see
-- 20260910090000_self_contained_database_baseline.sql's own GRANTS
-- section), this migration issues no explicit table-level GRANT/REVOKE
-- for agent_settings itself. Table-level SELECT/INSERT/UPDATE/DELETE for
-- anon/authenticated/service_role on new public-schema tables is a
-- Supabase project-level default (ALTER DEFAULT PRIVILEGES configured at
-- project bootstrap), reproducing it here would only duplicate that
-- platform default with no narrowing benefit -- Row Level Security
-- (enabled below, with owner-only SELECT/UPDATE policies and
-- deliberately no INSERT/DELETE policy) is what actually restricts row
-- access, exactly as it does for every sibling table. RLS is the SECOND
-- authorization layer here, not the only one: every application read/
-- write additionally funnels through verifyActiveBusiness() (see
-- src/features/agent-settings/api/authorize.ts), which independently
-- confirms the requested business belongs to the signed-in owner before
-- any query even reaches Postgres.
--
-- The one function this migration DOES create
-- (provision_agent_settings(), a trigger function) explicitly revokes
-- EXECUTE from public, anon, AND authenticated -- not merely from
-- public -- learning directly from this branch's own prior finding in
-- 20260923090000_harden_rate_limit_rpc_grants.sql: this Supabase
-- project's own default privileges grant EXECUTE on every new function
-- directly to anon/authenticated, a grant that `revoke ... from public`
-- alone never removes. A direct per-role revoke is required from the
-- start for every new function this repository ever creates, not only
-- for RPC-shaped ones -- applied here even though a trigger function is
-- already unreachable via direct RPC regardless of any EXECUTE grant
-- (Postgres refuses "trigger functions can only be called as triggers"),
-- purely so a future grant audit of this schema finds nothing to flag.
--
-- Rerun-safe throughout: `create table if not exists`, `drop policy if
-- exists` + `create policy`, `drop trigger if exists` + `create
-- trigger`, and `on conflict ... do nothing` for both the backfill and
-- the provisioning trigger's own insert.
--
-- Never adds a provider, model, API key, temperature, system-prompt
-- internals, token limit, pricing, autonomous-action, or channel-
-- specific column -- see this milestone's own task description for the
-- full deliberately-excluded list. Never logs a business id or any user
-- data anywhere in this file.

create table if not exists public.agent_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  tone text not null default 'professional',
  response_length text not null default 'balanced',
  custom_instructions text,
  configured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_settings_business_id_key unique (business_id),
  constraint agent_settings_tone_check
    check (tone in ('professional', 'friendly', 'warm')),
  constraint agent_settings_response_length_check
    check (response_length in ('concise', 'balanced', 'detailed')),
  -- NULL is allowed (no custom instructions yet). A non-null value must
  -- have a trimmed length between 1 and 4000 characters -- this rejects
  -- whitespace-only content (btrim('   ') has length 0, failing the
  -- `>= 1` half of `between`) without needing a separate check. The
  -- application layer additionally normalizes (trims, and converts
  -- empty-after-trim to NULL) before ever writing here -- see
  -- src/features/agent-settings/api/service.ts -- this constraint is
  -- defense in depth, not the only place the rule is enforced.
  constraint agent_settings_custom_instructions_check
    check (
      custom_instructions is null
      or length(btrim(custom_instructions)) between 1 and 4000
    )
);

-- updated_at: the same shared BEFORE UPDATE trigger function every other
-- foundational table uses (public.set_updated_at(), defined in
-- 20260910090000_self_contained_database_baseline.sql -- not redefined
-- here).
drop trigger if exists set_updated_at on public.agent_settings;

create trigger set_updated_at
  before update on public.agent_settings
  for each row
  execute function public.set_updated_at();

comment on table public.agent_settings is
  'One row per business: future-facing AI behavioral configuration only (tone, response length, custom instructions). Not consumed by any reply engine yet -- see this migration''s own header comment for the full field-ownership audit and the reasoning for every column deliberately excluded (no provider/model/API key/system-prompt internals).';

-- ---------------------------------------------------------------------
-- RLS -- owner-only SELECT/UPDATE, no owner INSERT or DELETE policy
-- (mirrors widget_settings_select_own / widget_settings_update_own in
-- 20260915193000_repair_live_rls_policies.sql exactly: the default row
-- is created by the provisioning trigger below, and the app never lets
-- an owner delete it). anon has no policy at all, so anon has zero
-- access regardless of table-level grants. Another business's owner
-- fails the `exists (... b.owner_id = auth.uid())` subquery and sees
-- zero rows / zero rows affected, never an error that would leak
-- existence. service_role bypasses RLS entirely (BYPASSRLS), the same
-- as every other table in this schema -- no service_role-specific
-- policy is needed or added.
-- ---------------------------------------------------------------------
alter table public.agent_settings enable row level security;

drop policy if exists "agent_settings_select_own" on public.agent_settings;
drop policy if exists "agent_settings_update_own" on public.agent_settings;

create policy "agent_settings_select_own"
  on public.agent_settings
  for select
  to authenticated
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.businesses b
      where b.id = agent_settings.business_id
        and b.owner_id = auth.uid()
    )
  );

create policy "agent_settings_update_own"
  on public.agent_settings
  for update
  to authenticated
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.businesses b
      where b.id = agent_settings.business_id
        and b.owner_id = auth.uid()
    )
  )
  with check (
    auth.uid() is not null
    and exists (
      select 1
      from public.businesses b
      where b.id = agent_settings.business_id
        and b.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- Backfill: exactly one default agent_settings row for every business
-- that already exists. Rerun-safe (`on conflict (business_id) do
-- nothing`) and additive only -- never updates or deletes an existing
-- agent_settings row, so rerunning this migration after an owner has
-- already changed their settings can never overwrite that change.
-- ---------------------------------------------------------------------
insert into public.agent_settings (business_id)
select b.id
from public.businesses b
on conflict (business_id) do nothing;

-- ---------------------------------------------------------------------
-- Future provisioning: a small, dedicated AFTER INSERT trigger on
-- public.businesses, not a rewrite of on_auth_user_created/
-- handle_new_user(). SECURITY DEFINER is required for the same reason
-- handle_new_user() needs it -- an authenticated owner has no INSERT
-- policy on agent_settings (by design, per this migration's own header
-- comment), so this must run with elevated privilege regardless of who
-- or what inserted the business row. `set search_path = public` pins
-- name resolution, and every relation reference is additionally fully
-- schema-qualified, matching handle_new_user()'s own hardening.
--
-- Concurrency/duplicate safety: `on conflict (business_id) do nothing`
-- against agent_settings_business_id_key makes a second/concurrent
-- invocation for the same business_id (impossible in practice, since
-- business_id is that table's own primary key and a row can only ever
-- be inserted once -- but this function is also called directly by the
-- backfill's own future reruns and by any other code path that inserts
-- into businesses) a safe no-op, with no advisory lock needed: unlike
-- widget_settings' own provisioning step in handle_new_user() (which
-- has no provable unique constraint and so needs pg_advisory_xact_lock),
-- agent_settings_business_id_key is a real, freshly-created UNIQUE
-- constraint this same migration owns, so ON CONFLICT is sufficient on
-- its own.
--
-- Never logs a business id or any user data -- this function touches no
-- RAISE/log statement at all.
create or replace function public.provision_agent_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.agent_settings (business_id)
  values (new.id)
  on conflict (business_id) do nothing;

  return new;
end;
$$;

comment on function public.provision_agent_settings() is
  'Provisions exactly one default public.agent_settings row whenever a public.businesses row is inserted -- existing businesses and new signups alike (this trigger fires for handle_new_user()''s own businesses insert too, since that insert runs through the same table). Idempotent and duplicate-safe via ON CONFLICT (business_id) against agent_settings_business_id_key. Not callable as an exposed RPC -- EXECUTE is revoked from public, anon, and authenticated below; only the trigger mechanism invokes it, regardless of any EXECUTE grant. Never logs a business id or any user data.';

-- See this migration's own GRANTS section above for why `from public,
-- anon, authenticated` (not merely `from public`) is required.
revoke all on function public.provision_agent_settings() from public, anon, authenticated;

drop trigger if exists on_business_created on public.businesses;

create trigger on_business_created
  after insert on public.businesses
  for each row
  execute function public.provision_agent_settings();
