-- Self-contained new-owner ACCOUNT provisioning — profiles, businesses,
-- widget_settings only, never a seeded demo/content dataset — this
-- repository becomes the authoritative source for what happens when a
-- new auth.users row is created, replacing the equivalent trigger/
-- function that has lived outside this repo in the older ChatbotDemo
-- project.
--
-- LEGACY OBJECT THIS REPLACES (documented, not independently verified —
-- see the "What this migration cannot verify" note below): every prior
-- comment in this repo's own migrations that mentions the existing
-- provisioning consistently calls it ChatbotDemo's `handle_new_user`
-- trigger, "security definer, fires on auth.users insert" (see
-- supabase/migrations/20260915193000_repair_live_rls_policies.sql and
-- supabase/migrations/20260921090000_single_business_per_owner.sql).
-- That name/shape also matches Supabase's own standard, widely-used
-- "new user provisioning" pattern (a SECURITY DEFINER
-- `public.handle_new_user()` function plus an `on_auth_user_created`
-- AFTER INSERT trigger on auth.users) closely enough that this
-- migration deliberately REUSES those exact two names rather than
-- inventing new ones:
--   - `CREATE OR REPLACE FUNCTION public.handle_new_user()` safely
--     replaces the legacy function body in place, under the same name.
--   - `DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users` then
--     `CREATE TRIGGER on_auth_user_created ...` safely replaces the
--     legacy trigger, under the same name — this can never result in
--     two triggers on auth.users both provisioning a new owner, because
--     the old one (if it used this name) is dropped by name first, and
--     re-running this migration always converges on exactly the one
--     trigger below.
-- This migration does not touch any other trigger on auth.users by
-- name or by iterating pg_trigger — only this one, explicit name.
--
-- What this migration cannot verify (no live Supabase access from this
-- environment — see this branch's PR report): if the production
-- trigger and/or function actually use different names than
-- `on_auth_user_created`/`handle_new_user`, this migration will NOT
-- find or disable them, and BOTH would fire on every future signup —
-- the legacy one first (its own logic, unaware of
-- businesses_owner_id_key) and this one second (or vice versa),
-- risking a unique-violation on businesses_owner_id_key that fails the
-- whole signup. The PR report gives the exact read-only SQL to check
-- the real trigger/function names in Supabase before relying on this
-- migration in production, and what to do if they differ.
--
-- Additive and rerun-safe: CREATE OR REPLACE FUNCTION and
-- DROP TRIGGER IF EXISTS + CREATE TRIGGER are both idempotent — running
-- this file any number of times converges on the exact same function
-- body and the exact same one trigger. Does not create, drop, or alter
-- any table, column, or RLS policy, and does not touch any existing
-- profiles/businesses/widget_settings row — see the idempotency notes
-- on each insert below. Installing this migration does not itself
-- create, modify, or delete any row for an existing account; it only
-- changes what happens on a FUTURE auth.users insert.
--
-- Single-business compatibility: this function looks up an existing
-- business by owner_id before ever inserting one, and the INSERT itself
-- targets `on conflict (owner_id) where owner_id is not null do
-- nothing` against businesses_owner_id_key
-- (supabase/migrations/20260921090000_single_business_per_owner.sql) —
-- it can never create a second business for the same owner, with or
-- without a race between two invocations (see the re-select after
-- insert below). The `where owner_id is not null` on the conflict
-- target is required, not optional: businesses_owner_id_key is a
-- PARTIAL unique index (see that migration's own `create unique index
-- ... where owner_id is not null`), and Postgres's ON CONFLICT arbiter
-- inference ignores a partial index unless the conflict target's own
-- predicate matches it exactly — a bare `on conflict (owner_id)` here
-- would fail at runtime with "there is no unique or exclusion
-- constraint matching the ON CONFLICT specification" rather than
-- silently doing the wrong thing, but that failure would still break
-- every signup, so this migration gets the predicate right up front.
--
-- Scope: account provisioning only, deliberately zero knowledge items
-- — this migration is named and described as self-contained ACCOUNT
-- provisioning, not seeded demo/starter content, precisely because it
-- inserts none. This repo's existing
-- resolveOnboardingResumeStep() (src/features/onboarding/utils/setup-progress.ts)
-- and its test suite explicitly rely on a brand-new business having
-- ZERO knowledge_items — that is precisely the signal used to resume a
-- new owner at onboarding step 1 rather than skipping ahead (see that
-- file's own doc comment and
-- src/features/onboarding/utils/setup-progress.test.ts's "starts a
-- brand-new owner at the business info step" case). No starter
-- knowledge_items dataset exists anywhere in this repo's application
-- code today — the onboarding wizard's own "add at least
-- MINIMUM_KNOWLEDGE_ITEMS" step is the only "starter content"
-- mechanism this repo actually expects. Auto-inserting any
-- knowledge_items row here would silently break that resume logic for
-- every future signup. This migration therefore seeds profiles,
-- businesses (with the same kind of placeholder business identity
-- ChatbotDemo's own trigger seeded — see
-- supabase/migrations/20260915000100_platform_onboarding.sql's header
-- comment) and widget_settings only, and inserts zero knowledge_items
-- rows, matching the behavior this repository's own application code
-- already depends on.
--
-- Signup metadata: the only metadata this app's own signup form sends
-- is `display_name` (see src/features/auth/components/signup-form.tsx)
-- — a plain string, never trusted for owner id, business id,
-- authorization, or any role/permission decision. Read defensively
-- below (missing, empty, whitespace-only, non-string-shaped, or
-- absurdly long all fall back safely) and never logged.
--
-- Security: SECURITY DEFINER (required — the auth.users insert runs
-- outside any authenticated/anon/service_role context, so the function
-- needs elevated privilege to write public.profiles/businesses/
-- widget_settings, the same reasoning already used for this repo's
-- other SECURITY DEFINER functions, e.g.
-- supabase/migrations/20260916120000_widget_allowed_origins.sql's
-- resolve_widget_config). `set search_path = public` pins name
-- resolution regardless of the caller's own search_path, and every
-- relation reference inside is additionally fully schema-qualified
-- (public.profiles / public.businesses / public.widget_settings), so
-- there is no ambiguity for a hijacked search_path to exploit even
-- without the `set` clause. EXECUTE is revoked from PUBLIC — nothing
-- needs to call this function directly; the trigger mechanism invokes
-- it regardless of any EXECUTE grant. Never logs an email address, a
-- user id, a business id, or raw signup metadata — the one defensive
-- RAISE EXCEPTION this function can hit carries a fixed, generic
-- message only. Does not disable, weaken, or replace any existing RLS
-- policy; every insert below runs through SECURITY DEFINER exactly
-- like every other privileged write already in this schema, not
-- through a new RLS bypass.
--
-- Atomicity: this function makes no attempt to catch or swallow its
-- own errors — an AFTER INSERT trigger on auth.users runs inside the
-- same transaction as the auth.users insert itself, so an unhandled
-- exception here rolls back the entire signup atomically (no
-- auth.users row, no partially-provisioned profiles/businesses/
-- widget_settings row) rather than ever leaving a half-initialized
-- account.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text;
  v_business_id uuid;
  v_slug text;
begin
  -- 1. profiles: exactly one row per auth user, keyed by id (the
  --    primary key / FK to auth.users.id). `on conflict (id) do
  --    nothing` makes a second invocation for the same NEW.id a pure
  --    no-op — it never duplicates the row and never overwrites a
  --    display_name (or any other profile field) the owner has since
  --    edited via profiles_update_own.
  --
  --    display_name: prefer the signup form's own metadata field
  --    (never trusted for anything beyond display text), falling back
  --    to the local part of the email, then to a fixed generic label —
  --    the same "derive from email" fallback this app's own
  --    signup-form.tsx comment already documents for the legacy
  --    trigger. Trimmed and length-capped regardless of source.
  v_display_name := nullif(
    trim(both from coalesce(new.raw_user_meta_data ->> 'display_name', '')),
    ''
  );
  if v_display_name is null then
    v_display_name := nullif(split_part(coalesce(new.email, ''), '@', 1), '');
  end if;
  if v_display_name is null then
    v_display_name := 'Owner';
  end if;
  v_display_name := left(v_display_name, 100);

  insert into public.profiles (id, display_name, onboarding_completed)
  values (new.id, v_display_name, false)
  on conflict (id) do nothing;

  -- 2. businesses: at most one row per owner_id, enforced by
  --    businesses_owner_id_key (supabase/migrations/20260921090000_single_business_per_owner.sql).
  --    Looks up an existing row first (never touches it if found — no
  --    UPDATE, ever, on an existing business row from this function),
  --    and only inserts when the owner truly has none yet.
  select id into v_business_id
  from public.businesses
  where owner_id = new.id
  limit 1;

  if v_business_id is null then
    v_business_id := gen_random_uuid();
    v_slug := 'business-' || replace(v_business_id::text, '-', '');

    insert into public.businesses (
      id, owner_id, name, slug, public_widget_id, business_type,
      location, default_language, supported_languages, handoff_email,
      is_active
    )
    values (
      v_business_id, new.id, 'Adria Stay Budva', v_slug, gen_random_uuid(),
      'hotel', 'Budva, Montenegro', 'en', array['en'], null, true
    )
    on conflict (owner_id) where owner_id is not null do nothing;

    -- Race guard: if a concurrent invocation for this same owner_id
    -- already won between the select above and this insert, the insert
    -- above is silently skipped by businesses_owner_id_key and
    -- v_business_id (freshly generated, never actually written) does
    -- not point at a real row — re-select so widget_settings below is
    -- always seeded against whichever business row really exists for
    -- this owner, never a business_id nothing in businesses actually
    -- has.
    select id into v_business_id
    from public.businesses
    where owner_id = new.id
    limit 1;
  end if;

  if v_business_id is null then
    -- Defensive only — should be unreachable given the logic above.
    -- Fixed, generic message: never interpolates an id, email, or any
    -- other value.
    raise exception 'New-owner business provisioning failed.';
  end if;

  -- 3. widget_settings: at most one row per business. No unique
  --    constraint on widget_settings.business_id is provable from this
  --    repository (that table, like businesses, is defined outside it)
  --    — a bare "if not exists (select ...) then insert" would be a
  --    genuine check-then-insert race under concurrency: two
  --    invocations for the same business_id could both pass the
  --    existence check before either commits its insert, producing two
  --    widget_settings rows for one business. Instead of assuming a
  --    constraint this migration cannot confirm exists, this serializes
  --    at the transaction level: pg_advisory_xact_lock blocks a second
  --    concurrent invocation for the same v_business_id until the first
  --    one's transaction commits or rolls back (the lock is released
  --    automatically either way — no explicit unlock needed), so by the
  --    time a second invocation reaches the existence check below, the
  --    first invocation's insert (or its absence, if it rolled back) is
  --    already visible. hashtext() reduces v_business_id to a lock key;
  --    an extremely rare hash collision between two different business
  --    ids would only ever cause unrelated invocations to serialize
  --    against each other unnecessarily, never an incorrect skip or a
  --    duplicate row. Never touches an existing row's settings — this
  --    is an existence check plus INSERT, never an UPDATE.
  perform pg_advisory_xact_lock(hashtext('widget_settings:' || v_business_id::text)::bigint);

  if not exists (
    select 1 from public.widget_settings where business_id = v_business_id
  ) then
    insert into public.widget_settings (
      business_id, title, welcome_message_en, welcome_message_me,
      welcome_message_ru, primary_color, "position", mock_ai_enabled,
      widget_enabled, human_handoff_enabled, allowed_origins,
      installation_confirmed
    )
    values (
      v_business_id, '', null, null, null, '#1677ff', 'bottom-right',
      true, true, false, '{}', false
    );
  end if;

  -- 4. Account provisioning ends here — deliberately zero
  --    knowledge_items. See this migration's own header comment for
  --    why seeding any knowledge_items row here would conflict with
  --    this repo's existing onboarding resume-step logic.

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Self-contained new-owner ACCOUNT provisioning for ai-receptionist-platform (replaces the equivalent trigger previously maintained in the ChatbotDemo project — see supabase/migrations/20260922090000_self_contained_user_provisioning.sql). Fires once per auth.users insert via the on_auth_user_created trigger. Creates exactly one profiles row, at most one businesses row (owner_id is unique via the partial index businesses_owner_id_key — the ON CONFLICT target matches its predicate exactly), and at most one widget_settings row for that business (serialized per business_id with pg_advisory_xact_lock, since no unique constraint on widget_settings.business_id is provable from this repository). Idempotent and concurrency-safe: safe to invoke more than once, including concurrently, for the same auth user without duplicating or overwriting any row. Inserts zero knowledge_items — this is account provisioning, not seeded demo/starter content; see this function''s own migration file for why. Never logs an email address, user id, business id, or raw signup metadata.';

revoke all on function public.handle_new_user() from public;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

comment on trigger on_auth_user_created on auth.users is
  'Calls public.handle_new_user() to provision a new owner''s profiles/businesses/widget_settings rows. Installed by supabase/migrations/20260922090000_self_contained_user_provisioning.sql, which is this repository''s own authoritative replacement for the equivalent trigger previously maintained outside this repo in the ChatbotDemo project. Exactly one trigger of this name exists on auth.users; rerunning this migration replaces it in place rather than adding a second one.';
