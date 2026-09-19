-- Self-contained new-owner provisioning: this repository becomes the
-- authoritative source for what happens when a new auth.users row is
-- created, replacing the equivalent trigger/function that has lived
-- outside this repo in the older ChatbotDemo project.
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
-- targets `on conflict (owner_id) do nothing` against
-- businesses_owner_id_key (supabase/migrations/20260921090000_single_business_per_owner.sql)
-- — it can never create a second business for the same owner, with or
-- without a race between two invocations (see the re-select after
-- insert below).
--
-- Starter knowledge items — a deliberate deviation from a literal
-- "seed starter knowledge_items" reading, documented here as the
-- conflict this migration's own audit found: this repo's existing
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
    on conflict (owner_id) do nothing;

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
  --    constraint on widget_settings.business_id is assumed here (this
  --    table, like businesses, is defined outside this repo) — guarded
  --    instead by an explicit existence check, so this is safe whether
  --    or not such a constraint exists in the live schema, and never
  --    touches an existing row's settings.
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

  -- 4. Starter knowledge items: deliberately none — see this
  --    migration's own header comment for why seeding any
  --    knowledge_items row here would conflict with this repo's
  --    existing onboarding resume-step logic.

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'New-owner provisioning for ai-receptionist-platform, self-contained in this repository (replaces the equivalent trigger previously maintained in the ChatbotDemo project — see supabase/migrations/20260922090000_self_contained_user_provisioning.sql). Fires once per auth.users insert via the on_auth_user_created trigger. Creates exactly one profiles row, at most one businesses row (owner_id is unique — see businesses_owner_id_key), and at most one widget_settings row for that business. Idempotent: safe to invoke more than once for the same auth user without duplicating or overwriting any row. Inserts zero knowledge_items — see this function''s own migration file for why. Never logs an email address, user id, business id, or raw signup metadata.';

revoke all on function public.handle_new_user() from public;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

comment on trigger on_auth_user_created on auth.users is
  'Calls public.handle_new_user() to provision a new owner''s profiles/businesses/widget_settings rows. Installed by supabase/migrations/20260922090000_self_contained_user_provisioning.sql, which is this repository''s own authoritative replacement for the equivalent trigger previously maintained outside this repo in the ChatbotDemo project. Exactly one trigger of this name exists on auth.users; rerunning this migration replaces it in place rather than adding a second one.';
