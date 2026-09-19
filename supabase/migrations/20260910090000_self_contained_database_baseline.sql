-- Self-contained database baseline — authoritative CREATE TABLE source for
-- the platform's foundational schema (profiles, businesses,
-- knowledge_items, conversations, messages, leads, handoffs,
-- widget_settings), which until now existed only in the older, external
-- ChatbotDemo project. This repository's own migrations
-- (supabase/migrations/20260915000100_platform_onboarding.sql onward)
-- have always assumed these eight tables already exist and only ever
-- ADD to them (columns, policies, indexes) — none of them create the
-- tables themselves. A brand-new, empty Supabase project therefore could
-- not run this repository's migration history from beginning to end.
-- This migration is what makes it able to.
--
-- REVISION 2 — corrected against a read-only comparison of this
-- migration's first revision against the actual LIVE production
-- Supabase schema. Every fact below marked VERIFIED comes directly from
-- that live comparison, not from inference. Three real mistakes in the
-- first revision are fixed here:
--   1. businesses.owner_id referenced auth.users(id) directly. The live
--      schema instead has businesses.owner_id -> public.profiles(id) ON
--      DELETE CASCADE, and it is profiles.id that references
--      auth.users(id) ON DELETE CASCADE. Fixed below.
--   2. leads.reference was believed to be unconstrained. The live schema
--      has leads_reference_key UNIQUE (reference). Fixed below, with the
--      same duplicate-preflight pattern as this migration's other
--      unique indexes.
--   3. The updated_at trigger mechanism was invented with per-table
--      names (set_updated_at_<table>) as an inferred, not-yet-verified
--      mechanism. The live database has exactly this mechanism, but
--      under one shared trigger name (`set_updated_at`, reused per
--      table — trigger names only need to be unique per table, not
--      database-wide) and a SECURITY INVOKER function whose exact body
--      is reproduced verbatim below. Fixed below.
--
-- MIGRATION-ORDER WARNING — read before ever running Supabase CLI
-- migration commands against production after this file exists in this
-- directory's history:
--   - This file is timestamped 20260910090000, earlier than every
--     migration already applied to production (the earliest applied
--     migration is 20260915000100_platform_onboarding.sql). That is
--     intentional: it is what lets a brand-new, EMPTY Supabase project
--     run this repository's entire migration history from scratch.
--   - It is primarily a fresh-database baseline. It is NOT meant to be
--     casually executed against the current production database.
--   - Production already contains all eight of these foundational
--     tables, in the exact shape this migration reproduces (that is the
--     whole point — see REVISION 2 above). Every statement in this file
--     is written to be a safe no-op against that existing shape (see
--     EXISTING-DATABASE SAFETY below), but "safe to run" is not the same
--     as "needs to be run."
--   - Merging this branch, or this file existing in the repository's
--     migration history, does not by itself mean anyone should manually
--     execute it against production.
--   - Because its timestamp sorts before migrations Supabase's own CLI
--     already recorded as applied, a future `supabase db push` (or
--     equivalent reconciliation) against production may need this
--     migration's version explicitly marked as already applied —
--     e.g. `supabase migration repair --status applied 20260910090000`
--     — rather than actually executed, so the CLI's own migration-
--     history table stays in sync with what production really has. That
--     reconciliation step belongs to whoever manages the Supabase
--     CLI/production migration state, not to this file.
--
-- SCOPE — deliberately narrow. This migration creates each of the eight
-- tables in the shape they had BEFORE this repository's own additive
-- migrations touched them, and nothing more:
--   - profiles: WITHOUT onboarding_completed / onboarding_completed_at
--     (added by 20260915000100_platform_onboarding.sql)
--   - businesses: WITHOUT the businesses_owner_id_key unique index
--     (added by 20260921090000_single_business_per_owner.sql)
--   - messages: WITHOUT sender_type / client_message_id, and WITHOUT the
--     messages_sender_type_check constraint on that column (all three
--     added by 20260915170200_inbox_human_replies.sql — VERIFIED live to
--     exist, but owned entirely by that migration, not duplicated here)
--   - widget_settings: WITHOUT widget_enabled / allowed_origins (added
--     by 20260916120000_widget_allowed_origins.sql) and WITHOUT
--     installation_confirmed / installation_confirmed_at (added by
--     20260917140000_widget_installation_confirmed.sql)
--   - handoffs: WITHOUT client_request_id
--     (added by 20260918090000_handoff_idempotency.sql)
--   - knowledge_items, conversations, leads: unchanged by any later
--     migration in this repo, so their shape here is already final.
-- Every one of those later migrations already uses `add column if not
-- exists` / `create index if not exists` / `create policy` (drop-then-
-- create), so running them against the tables this migration creates
-- converges on exactly the same end state as running them against the
-- real, existing ChatbotDemo-created tables in production. This
-- migration intentionally does NOT create any of those later objects
-- itself — see "Not duplicate objects created by later migrations" below.
--
-- EVIDENCE, split into three explicit categories rather than one blended
-- list, per this migration's own revision-2 correction request:
--
--   VERIFIED LIVE FACTS (confirmed by a read-only comparison against the
--   actual production Supabase schema, not inferred):
--     - businesses.owner_id -> public.profiles(id) on delete cascade
--     - profiles.id -> auth.users(id) on delete cascade
--     - businesses.slug is unique; businesses.public_widget_id is unique
--     - widget_settings.business_id is unique; leads.reference is unique
--       (leads_reference_key)
--     - every FK delete rule listed in the per-table sections below
--     - every CHECK constraint listed in the per-table sections below
--       (channel/status/role/sender_type/source/position vocabularies,
--       businesses.supported_languages non-empty, messages.content
--       length 1-4000, leads.check_out >= leads.check_in,
--       leads.guest_count 1-4)
--     - public.set_updated_at()'s exact signature and body (language
--       plpgsql, SECURITY INVOKER, no search_path override), reproduced
--       verbatim below, owned by postgres, executable by PUBLIC (which
--       already covers anon/authenticated/postgres/service_role — see
--       GRANTS below)
--     - a BEFORE UPDATE trigger named `set_updated_at` (one shared name,
--       reused per table) on profiles, businesses, knowledge_items,
--       conversations, leads, handoffs, and widget_settings; messages
--       has none
--     - RLS is enabled on all eight tables with owner-scoped policies
--       already installed
--
--   STILL INFERRED (this migration's own reasonable choice, not
--   independently confirmed against the live schema, and called out as
--   such rather than silently presented as verified):
--     - Every plain performance index this migration adds beyond the
--       four verified unique ones (e.g.
--       knowledge_items_business_id_sort_order_created_at_idx,
--       conversations_business_id_updated_at_idx,
--       leads_business_id_created_at_idx and
--       leads_conversation_id_created_at_idx,
--       handoffs_business_id_created_at_idx and
--       handoffs_conversation_id_created_at_idx,
--       messages_conversation_id_created_at_idx) — inferred from this
--       repository's own `.order()`/`.eq()` query patterns (see each
--       table's own comment below), not confirmed to exist under these
--       exact names in production. Harmless either way: an index is a
--       pure performance aid, never a correctness or security concern,
--       and `create index if not exists` no-ops if an equivalent
--       already exists under a different name.
--
--   CANNOT BE RUNTIME-TESTED FROM THIS ENVIRONMENT: this migration's own
--   static SQL contract (its matching .test.ts) is the only verification
--   performed here — there is no local Supabase CLI or reachable Docker
--   daemon in this environment, so none of "run this against a blank
--   database," "confirm the signup trigger provisions correctly," or
--   "confirm RLS isolates two owners from each other" has been executed.
--   See this branch's own PR/report for the exact blocker.
--
-- EXISTING-DATABASE SAFETY — `create table if not exists` alone silently
-- accepts an incompatible pre-existing table (the exact failure mode
-- this repo's own 20260920100000_paddle_billing_foundation.sql hit in
-- production: `ERROR 42703: column "paddle_price_id" ... does not
-- exist`, because `create table if not exists` never retrofits a column
-- onto a table that already existed under that name). This migration
-- never assumes a same-named pre-existing table is compatible: after
-- each `create table if not exists`, a DO block checks that every column
-- this migration (and every later migration that assumes it) needs is
-- actually present, and that the table has a primary key, using
-- information_schema/pg_catalog only — never row contents. A pre-
-- existing, incompatible table fails loudly with a fixed, generic
-- exception naming only the table/column contract, never row values,
-- business IDs, user IDs, or customer data. This migration never
-- attempts to "repair" an incompatible table itself (add a missing
-- column, change a type) — that is a separate, explicit, verified
-- follow-up migration a human reviews first.
--
-- Never touches auth.users itself (no ALTER, no ownership/permission
-- change) beyond the ordinary, Supabase-permitted `references
-- auth.users(id)` foreign key on profiles.id alone (VERIFIED: businesses
-- no longer references auth.users at all — see REVISION 2 above) — the
-- same kind of reference every Supabase starter schema uses, and no
-- different in kind from every other `references public.<table>(id)`
-- foreign key elsewhere in this same migration.
--
-- Not duplicate objects created by later migrations: this migration
-- creates each of the eight tables with Row Level Security ENABLED and
-- ZERO policies — exactly the state 20260915193000_repair_live_rls_
-- policies.sql's own header comment documents finding in a live audit of
-- production ("businesses: 0 conversations: 0 ... widget_settings: 0")
-- before it ran. All owner-scoped policies for these tables already
-- exist as idempotent `drop policy if exists` + `create policy` pairs in
-- that migration and in 20260915184700_knowledge_items_owner_policies.sql
-- — this migration deliberately does not re-declare any of them, so
-- there is exactly one place in this repository that owns each policy's
-- SQL, and RLS is never weakened, disabled, or bypassed anywhere below.
-- This migration also never creates businesses_owner_id_key,
-- messages_client_message_id_key, the messages_sender_type_check
-- constraint, widget_settings.widget_enabled/allowed_origins/
-- installation_confirmed(_at), or handoffs.client_request_id — all
-- already owned by their own later migrations, listed in SCOPE above.
--
-- GRANTS — audited against every later migration before adding any of
-- this migration's own. VERIFIED: the live tables already have standard
-- Supabase table privileges for anon/authenticated/postgres/
-- service_role. This migration does not issue a single explicit GRANT
-- or REVOKE for any of the eight tables (or for set_updated_at()) —
-- table-level SELECT/INSERT/UPDATE/DELETE privileges for `anon`/
-- `authenticated`/`service_role` on newly created public-schema objects
-- are configured once, at the Supabase project level (via ALTER DEFAULT
-- PRIVILEGES set up when the project itself is provisioned — the same
-- mechanism every genuinely blank Supabase project gets from
-- `supabase init`/the platform's own project bootstrap), not per
-- migration. Every other migration in this repository that creates a
-- plain owner-scoped table follows the same rule (20260915193000_repair_
-- live_rls_policies.sql and 20260915184700_knowledge_items_owner_
-- policies.sql grant nothing either) — reproducing that default
-- privilege grant explicitly here would duplicate what the platform
-- itself already sets up for a self-contained blank project, with no
-- narrowing benefit, and RLS (enabled on every table below) is what
-- actually restricts row access once that default table-level privilege
-- applies. This migration never grants any access to the billing/
-- internal service-role-only tables owned by
-- 20260920100000_paddle_billing_foundation.sql or
-- 20260916130000_widget_rate_limits.sql — it does not touch those tables
-- at all.
--
-- Never deletes, truncates, or rewrites any existing row; never renames
-- or silently changes an existing column's type; never weakens,
-- disables, or drops any RLS policy, grant, index, constraint, or
-- trigger; contains no real user data, emails, business IDs, or secrets
-- anywhere, including in comments and identifiers.

-- =====================================================================
-- 0. Shared helper: set_updated_at(). VERIFIED to match the live
--    function's exact signature and body: plpgsql, SECURITY INVOKER
--    (the explicit keyword below matches the live definition verbatim;
--    it is also plpgsql's own default when omitted, so this changes no
--    behavior either way), no `set search_path` override, and no
--    grant/revoke statement — the live function is executable by
--    PUBLIC (which already covers anon/authenticated/postgres/
--    service_role; see GRANTS above), and PUBLIC execute is exactly
--    what a newly created function gets by default when nothing revokes
--    it, so nothing further is needed to reproduce that. This migration
--    never adds SECURITY DEFINER, never narrows search_path, and never
--    revokes the execute access every role already has.
-- =====================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Shared BEFORE UPDATE trigger function: stamps updated_at = now() on every row update. Installed by supabase/migrations/20260910090000_self_contained_database_baseline.sql for every foundational table with an updated_at column, reusing the one verified live trigger name `set_updated_at` per table.';

-- =====================================================================
-- 1. profiles — one row per auth.users row, keyed by the same id.
--    Columns/shape confirmed by: src/lib/supabase/database.types.ts
--    (ProfileRow, minus onboarding_completed/onboarding_completed_at,
--    which 20260915000100_platform_onboarding.sql's own header comment
--    documents as new additive columns it introduces).
--    VERIFIED live: profiles.id -> auth.users(id) on delete cascade —
--    this is the one FK in this whole migration that actually reaches
--    auth.users; businesses.owner_id below reaches profiles instead
--    (see REVISION 2 above and that table's own section).
-- =====================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare
  v_missing text[];
begin
  select array_agg(col) into v_missing
  from unnest(array['id', 'display_name', 'created_at', 'updated_at']) as col
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = col
  );
  if v_missing is not null then
    raise exception
      'public.profiles already exists but is missing required column(s): %. Resolve this schema mismatch in a verified, explicit follow-up migration before rerunning supabase/migrations/20260910090000_self_contained_database_baseline.sql.',
      array_to_string(v_missing, ', ');
  end if;

  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'profiles' and constraint_type = 'PRIMARY KEY'
  ) then
    raise exception
      'public.profiles already exists but has no primary key. Resolve this schema mismatch in a verified, explicit follow-up migration before rerunning supabase/migrations/20260910090000_self_contained_database_baseline.sql.';
  end if;
end $$;

alter table public.profiles enable row level security;

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

comment on table public.profiles is
  'One row per signed-up account, keyed by that same account''s id (references the platform''s own identity table, cascading on delete — see this migration''s own header comment for the verified detail). Baseline shape installed by supabase/migrations/20260910090000_self_contained_database_baseline.sql — see supabase/migrations/20260915000100_platform_onboarding.sql for this table''s additive post-signup onboarding-tracking columns and 20260922090000_self_contained_user_provisioning.sql for the trigger that populates this table on signup.';

-- =====================================================================
-- 2. businesses — one row per business; owner_id links to the owning
--    profiles row (NOT directly to auth.users — VERIFIED live and
--    corrected here; see REVISION 2 above). Columns/shape confirmed by
--    database.types.ts (BusinessRow) and by the exact column list
--    20260922090000_self_contained_user_provisioning.sql's own
--    handle_new_user() inserts:
--      id, owner_id, name, slug, public_widget_id, business_type,
--      location, default_language, supported_languages, handoff_email,
--      is_active
--    public_widget_id and slug are both VERIFIED live to be unique.
--    supported_languages must be non-empty (VERIFIED live CHECK) —
--    consistent with the default `array['en']` above and with every
--    business row this app's own signup trigger has ever created.
--    owner_id's own uniqueness (businesses_owner_id_key) is
--    deliberately NOT created here — see SCOPE above; that index
--    belongs to 20260921090000_single_business_per_owner.sql alone.
-- =====================================================================
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles (id) on delete cascade,
  name text not null,
  slug text not null,
  public_widget_id uuid not null default gen_random_uuid(),
  business_type text not null,
  location text,
  default_language text not null default 'en',
  supported_languages text[] not null default array['en'],
  handoff_email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint businesses_supported_languages_not_empty_check
    check (cardinality(supported_languages) > 0)
);

do $$
declare
  v_missing text[];
begin
  select array_agg(col) into v_missing
  from unnest(array[
    'id', 'owner_id', 'name', 'slug', 'public_widget_id', 'business_type',
    'location', 'default_language', 'supported_languages', 'handoff_email',
    'is_active', 'created_at', 'updated_at'
  ]) as col
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'businesses' and column_name = col
  );
  if v_missing is not null then
    raise exception
      'public.businesses already exists but is missing required column(s): %. Resolve this schema mismatch in a verified, explicit follow-up migration before rerunning supabase/migrations/20260910090000_self_contained_database_baseline.sql.',
      array_to_string(v_missing, ', ');
  end if;

  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'businesses' and constraint_type = 'PRIMARY KEY'
  ) then
    raise exception
      'public.businesses already exists but has no primary key. Resolve this schema mismatch in a verified, explicit follow-up migration before rerunning supabase/migrations/20260910090000_self_contained_database_baseline.sql.';
  end if;
end $$;

-- Pre-check before each unique index below, same pattern as
-- 20260921090000_single_business_per_owner.sql's own owner_id check:
-- raise a clear diagnostic naming only the count/value, never any other
-- row data, rather than a bare unique-violation error or a silent skip.
do $$
declare
  v_dup_count integer;
begin
  select count(*) into v_dup_count
  from (
    select public_widget_id from public.businesses
    group by public_widget_id having count(*) > 1
  ) dupes;
  if v_dup_count > 0 then
    raise exception
      'public.businesses has % public_widget_id value(s) shared by more than one row — a unique public_widget_id index cannot be safely applied while duplicates exist. Resolve in a verified follow-up migration before rerunning supabase/migrations/20260910090000_self_contained_database_baseline.sql.',
      v_dup_count;
  end if;
end $$;

create unique index if not exists businesses_public_widget_id_key
  on public.businesses (public_widget_id);

do $$
declare
  v_dup_count integer;
begin
  select count(*) into v_dup_count
  from (
    select slug from public.businesses
    group by slug having count(*) > 1
  ) dupes;
  if v_dup_count > 0 then
    raise exception
      'public.businesses has % slug value(s) shared by more than one row — a unique slug index cannot be safely applied while duplicates exist. Resolve in a verified follow-up migration before rerunning supabase/migrations/20260910090000_self_contained_database_baseline.sql.',
      v_dup_count;
  end if;
end $$;

create unique index if not exists businesses_slug_key
  on public.businesses (slug);

alter table public.businesses enable row level security;

drop trigger if exists set_updated_at on public.businesses;
create trigger set_updated_at
  before update on public.businesses
  for each row
  execute function public.set_updated_at();

comment on table public.businesses is
  'One row per business. owner_id references public.profiles(id) on delete cascade — see this migration''s own header comment for why that indirection, rather than a direct identity-table reference, is the verified shape. Baseline shape installed by supabase/migrations/20260910090000_self_contained_database_baseline.sql — see 20260921090000_single_business_per_owner.sql for the additive owner_id uniqueness constraint and 20260922090000_self_contained_user_provisioning.sql for the trigger that populates this table on signup.';

-- =====================================================================
-- 3. knowledge_items — FAQ-style entries scoped to a business. Columns
--    confirmed by database.types.ts (KnowledgeItemRow) and by
--    src/features/knowledge/api/service.ts's own INSERT (supplies
--    business_id, category, question, answer_en, answer_me, answer_ru,
--    is_active, sort_order — every one of those explicitly, every time)
--    and its list query's `.eq('business_id', ...).order('sort_order',
--    { ascending: true }).order('created_at', { ascending: true })` —
--    the index below is this migration's own inference from that query
--    pattern, not independently verified against the live database (see
--    "STILL INFERRED" in this migration's own header comment).
-- =====================================================================
create table if not exists public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  category text not null,
  question text not null,
  answer_en text not null,
  answer_me text,
  answer_ru text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare
  v_missing text[];
begin
  select array_agg(col) into v_missing
  from unnest(array[
    'id', 'business_id', 'category', 'question', 'answer_en', 'answer_me',
    'answer_ru', 'is_active', 'sort_order', 'created_at', 'updated_at'
  ]) as col
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'knowledge_items' and column_name = col
  );
  if v_missing is not null then
    raise exception
      'public.knowledge_items already exists but is missing required column(s): %. Resolve this schema mismatch in a verified, explicit follow-up migration before rerunning supabase/migrations/20260910090000_self_contained_database_baseline.sql.',
      array_to_string(v_missing, ', ');
  end if;

  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'knowledge_items' and constraint_type = 'PRIMARY KEY'
  ) then
    raise exception
      'public.knowledge_items already exists but has no primary key. Resolve this schema mismatch in a verified, explicit follow-up migration before rerunning supabase/migrations/20260910090000_self_contained_database_baseline.sql.';
  end if;
end $$;

create index if not exists knowledge_items_business_id_sort_order_created_at_idx
  on public.knowledge_items (business_id, sort_order, created_at);

alter table public.knowledge_items enable row level security;

drop trigger if exists set_updated_at on public.knowledge_items;
create trigger set_updated_at
  before update on public.knowledge_items
  for each row
  execute function public.set_updated_at();

comment on table public.knowledge_items is
  'FAQ-style knowledge base entries scoped to a business, used both by the owner-facing dashboard and the AI receptionist''s own reply matching. Baseline shape installed by supabase/migrations/20260910090000_self_contained_database_baseline.sql — see 20260915184700_knowledge_items_owner_policies.sql for its owner-scoped RLS policies.';

-- =====================================================================
-- 4. conversations — one row per visitor conversation with a business's
--    widget. Columns confirmed by database.types.ts (ConversationRow)
--    and by src/lib/public-widget/runtime.ts's own INSERT (supplies
--    business_id, visitor_id, channel, detected_language, status,
--    human_takeover, lead_created, flow_state). channel and status
--    CHECK vocabularies are VERIFIED live.
-- =====================================================================
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  visitor_id text not null,
  channel text not null default 'website',
  detected_language text not null default 'en',
  status text not null default 'open',
  human_takeover boolean not null default false,
  lead_created boolean not null default false,
  flow_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_channel_check check (channel in ('website', 'instagram', 'whatsapp')),
  constraint conversations_status_check check (status in ('open', 'closed', 'handed_off'))
);

do $$
declare
  v_missing text[];
begin
  select array_agg(col) into v_missing
  from unnest(array[
    'id', 'business_id', 'visitor_id', 'channel', 'detected_language',
    'status', 'human_takeover', 'lead_created', 'flow_state', 'created_at',
    'updated_at'
  ]) as col
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'conversations' and column_name = col
  );
  if v_missing is not null then
    raise exception
      'public.conversations already exists but is missing required column(s): %. Resolve this schema mismatch in a verified, explicit follow-up migration before rerunning supabase/migrations/20260910090000_self_contained_database_baseline.sql.',
      array_to_string(v_missing, ', ');
  end if;

  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'conversations' and constraint_type = 'PRIMARY KEY'
  ) then
    raise exception
      'public.conversations already exists but has no primary key. Resolve this schema mismatch in a verified, explicit follow-up migration before rerunning supabase/migrations/20260910090000_self_contained_database_baseline.sql.';
  end if;
end $$;

create index if not exists conversations_business_id_updated_at_idx
  on public.conversations (business_id, updated_at desc);

alter table public.conversations enable row level security;

drop trigger if exists set_updated_at on public.conversations;
create trigger set_updated_at
  before update on public.conversations
  for each row
  execute function public.set_updated_at();

comment on table public.conversations is
  'One row per visitor conversation with a business''s widget. Baseline shape installed by supabase/migrations/20260910090000_self_contained_database_baseline.sql — see 20260915193000_repair_live_rls_policies.sql for its owner-scoped RLS policies.';

-- =====================================================================
-- 5. messages — one row per message within a conversation. Columns
--    confirmed by database.types.ts (MessageRow, minus sender_type/
--    client_message_id, which 20260915170200_inbox_human_replies.sql's
--    own header comment documents as its own additive columns — that
--    migration also owns the VERIFIED live messages_sender_type_check
--    constraint (sender_type null, 'ai', or 'human'), not duplicated
--    here). role vocabulary and content length (1-4000 characters) are
--    both VERIFIED live CHECK constraints owned by this baseline, since
--    role and content are original columns. No updated_at column and no
--    set_updated_at trigger — VERIFIED live.
-- =====================================================================
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role text not null,
  content text not null,
  intent text,
  created_at timestamptz not null default now(),
  constraint messages_role_check check (role in ('user', 'assistant', 'system')),
  constraint messages_content_length_check check (char_length(content) between 1 and 4000)
);

do $$
declare
  v_missing text[];
begin
  select array_agg(col) into v_missing
  from unnest(array[
    'id', 'conversation_id', 'role', 'content', 'intent', 'created_at'
  ]) as col
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = col
  );
  if v_missing is not null then
    raise exception
      'public.messages already exists but is missing required column(s): %. Resolve this schema mismatch in a verified, explicit follow-up migration before rerunning supabase/migrations/20260910090000_self_contained_database_baseline.sql.',
      array_to_string(v_missing, ', ');
  end if;

  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'messages' and constraint_type = 'PRIMARY KEY'
  ) then
    raise exception
      'public.messages already exists but has no primary key. Resolve this schema mismatch in a verified, explicit follow-up migration before rerunning supabase/migrations/20260910090000_self_contained_database_baseline.sql.';
  end if;
end $$;

create index if not exists messages_conversation_id_created_at_idx
  on public.messages (conversation_id, created_at);

alter table public.messages enable row level security;

comment on table public.messages is
  'One row per message within a conversation. This table deliberately tracks only when a row was first written, never when it was last modified. Baseline shape installed by supabase/migrations/20260910090000_self_contained_database_baseline.sql — see 20260915170200_inbox_human_replies.sql for this table''s additive Inbox-related columns and CHECK constraint and its owner-facing insert policy, and 20260915193000_repair_live_rls_policies.sql for the SELECT/DELETE owner policies.';

-- =====================================================================
-- 6. leads — captured booking/contact leads scoped to a business, with
--    an optional link back to the conversation that produced them.
--    Columns confirmed by database.types.ts (LeadRow) and by
--    src/lib/public-widget/runtime.ts's own INSERT. check_in/check_out
--    are date-only (never time-of-day) per
--    src/features/leads/api/service.test.ts's own fixture values
--    ('2026-08-14'). reference IS unique (leads_reference_key) —
--    VERIFIED live; this migration's first revision incorrectly
--    documented it as unconstrained (see REVISION 2 above). source/
--    status vocabularies, check_out >= check_in, and guest_count
--    1-4 are all VERIFIED live CHECK constraints.
-- =====================================================================
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  reference text not null,
  name text not null,
  contact text not null,
  check_in date,
  check_out date,
  guest_count integer,
  note text,
  language text not null default 'en',
  source text not null default 'website',
  status text not null default 'new',
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_source_check check (source in ('website', 'instagram', 'whatsapp')),
  constraint leads_status_check check (status in ('new', 'contacted', 'confirmed', 'lost')),
  constraint leads_check_out_after_check_in_check
    check (check_out is null or check_in is null or check_out >= check_in),
  constraint leads_guest_count_check
    check (guest_count is null or guest_count between 1 and 4)
);

do $$
declare
  v_missing text[];
begin
  select array_agg(col) into v_missing
  from unnest(array[
    'id', 'business_id', 'conversation_id', 'reference', 'name', 'contact',
    'check_in', 'check_out', 'guest_count', 'note', 'language', 'source',
    'status', 'consent_at', 'created_at', 'updated_at'
  ]) as col
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = col
  );
  if v_missing is not null then
    raise exception
      'public.leads already exists but is missing required column(s): %. Resolve this schema mismatch in a verified, explicit follow-up migration before rerunning supabase/migrations/20260910090000_self_contained_database_baseline.sql.',
      array_to_string(v_missing, ', ');
  end if;

  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'leads' and constraint_type = 'PRIMARY KEY'
  ) then
    raise exception
      'public.leads already exists but has no primary key. Resolve this schema mismatch in a verified, explicit follow-up migration before rerunning supabase/migrations/20260910090000_self_contained_database_baseline.sql.';
  end if;
end $$;

-- Duplicate preflight for leads_reference_key, same pattern as
-- businesses_public_widget_id_key / businesses_slug_key above.
do $$
declare
  v_dup_count integer;
begin
  select count(*) into v_dup_count
  from (
    select reference from public.leads
    group by reference having count(*) > 1
  ) dupes;
  if v_dup_count > 0 then
    raise exception
      'public.leads has % reference value(s) shared by more than one row — a unique reference index cannot be safely applied while duplicates exist. Resolve in a verified follow-up migration before rerunning supabase/migrations/20260910090000_self_contained_database_baseline.sql.',
      v_dup_count;
  end if;
end $$;

create unique index if not exists leads_reference_key
  on public.leads (reference);

create index if not exists leads_business_id_created_at_idx
  on public.leads (business_id, created_at desc);

create index if not exists leads_conversation_id_created_at_idx
  on public.leads (conversation_id, created_at desc);

alter table public.leads enable row level security;

drop trigger if exists set_updated_at on public.leads;
create trigger set_updated_at
  before update on public.leads
  for each row
  execute function public.set_updated_at();

comment on table public.leads is
  'Captured booking/contact leads scoped to a business. reference is unique (leads_reference_key — VERIFIED live). Baseline shape installed by supabase/migrations/20260910090000_self_contained_database_baseline.sql — see 20260915193000_repair_live_rls_policies.sql for its owner-scoped RLS policies.';

-- =====================================================================
-- 7. handoffs — human-handoff requests scoped to a business, with an
--    optional link back to the conversation that produced them. Columns
--    confirmed by database.types.ts (HandoffRow, minus
--    client_request_id, which 20260918090000_handoff_idempotency.sql's
--    own header comment documents as its own additive column) and by
--    src/lib/public-widget/runtime.ts's own INSERT. status vocabulary
--    is VERIFIED live.
-- =====================================================================
create table if not exists public.handoffs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  customer_name text,
  contact text not null,
  question text,
  reason text,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint handoffs_status_check check (status in ('new', 'contacted', 'resolved'))
);

do $$
declare
  v_missing text[];
begin
  select array_agg(col) into v_missing
  from unnest(array[
    'id', 'business_id', 'conversation_id', 'customer_name', 'contact',
    'question', 'reason', 'status', 'created_at', 'updated_at'
  ]) as col
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'handoffs' and column_name = col
  );
  if v_missing is not null then
    raise exception
      'public.handoffs already exists but is missing required column(s): %. Resolve this schema mismatch in a verified, explicit follow-up migration before rerunning supabase/migrations/20260910090000_self_contained_database_baseline.sql.',
      array_to_string(v_missing, ', ');
  end if;

  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'handoffs' and constraint_type = 'PRIMARY KEY'
  ) then
    raise exception
      'public.handoffs already exists but has no primary key. Resolve this schema mismatch in a verified, explicit follow-up migration before rerunning supabase/migrations/20260910090000_self_contained_database_baseline.sql.';
  end if;
end $$;

create index if not exists handoffs_business_id_created_at_idx
  on public.handoffs (business_id, created_at desc);

create index if not exists handoffs_conversation_id_created_at_idx
  on public.handoffs (conversation_id, created_at desc);

alter table public.handoffs enable row level security;

drop trigger if exists set_updated_at on public.handoffs;
create trigger set_updated_at
  before update on public.handoffs
  for each row
  execute function public.set_updated_at();

comment on table public.handoffs is
  'Human-handoff requests scoped to a business. Baseline shape installed by supabase/migrations/20260910090000_self_contained_database_baseline.sql — see 20260918090000_handoff_idempotency.sql for this table''s additive idempotency-key column and 20260915193000_repair_live_rls_policies.sql for its owner-scoped RLS policies.';

-- =====================================================================
-- 8. widget_settings — at most one row per business, holding the public
--    widget's display configuration. Columns confirmed by
--    database.types.ts (WidgetSettingsRow, minus widget_enabled/
--    allowed_origins/installation_confirmed(_at), each documented as
--    additive by its own later migration — see SCOPE above).
--    business_id is unique and position's vocabulary is VERIFIED live.
-- =====================================================================
create table if not exists public.widget_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  title text not null default '',
  welcome_message_en text,
  welcome_message_me text,
  welcome_message_ru text,
  primary_color text not null default '#1677ff',
  "position" text not null default 'bottom-right',
  mock_ai_enabled boolean not null default true,
  human_handoff_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint widget_settings_position_check check ("position" in ('bottom-right', 'bottom-left'))
);

do $$
declare
  v_missing text[];
begin
  select array_agg(col) into v_missing
  from unnest(array[
    'id', 'business_id', 'title', 'welcome_message_en', 'welcome_message_me',
    'welcome_message_ru', 'primary_color', 'position', 'mock_ai_enabled',
    'human_handoff_enabled', 'created_at', 'updated_at'
  ]) as col
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'widget_settings' and column_name = col
  );
  if v_missing is not null then
    raise exception
      'public.widget_settings already exists but is missing required column(s): %. Resolve this schema mismatch in a verified, explicit follow-up migration before rerunning supabase/migrations/20260910090000_self_contained_database_baseline.sql.',
      array_to_string(v_missing, ', ');
  end if;

  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'widget_settings' and constraint_type = 'PRIMARY KEY'
  ) then
    raise exception
      'public.widget_settings already exists but has no primary key. Resolve this schema mismatch in a verified, explicit follow-up migration before rerunning supabase/migrations/20260910090000_self_contained_database_baseline.sql.';
  end if;
end $$;

do $$
declare
  v_dup_count integer;
begin
  select count(*) into v_dup_count
  from (
    select business_id from public.widget_settings
    group by business_id having count(*) > 1
  ) dupes;
  if v_dup_count > 0 then
    raise exception
      'public.widget_settings has % business_id value(s) shared by more than one row — a unique business_id index cannot be safely applied while duplicates exist. Resolve in a verified follow-up migration before rerunning supabase/migrations/20260910090000_self_contained_database_baseline.sql.',
      v_dup_count;
  end if;
end $$;

create unique index if not exists widget_settings_business_id_key
  on public.widget_settings (business_id);

alter table public.widget_settings enable row level security;

drop trigger if exists set_updated_at on public.widget_settings;
create trigger set_updated_at
  before update on public.widget_settings
  for each row
  execute function public.set_updated_at();

comment on table public.widget_settings is
  'At most one row per business (widget_settings_business_id_key), holding the public widget''s display configuration. Baseline shape installed by supabase/migrations/20260910090000_self_contained_database_baseline.sql — see this table''s later, chronologically-numbered migrations for its additive columns, and 20260915193000_repair_live_rls_policies.sql for its owner-scoped RLS policies.';
