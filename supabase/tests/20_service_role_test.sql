-- Service-role-only database operations — proves the specific internal
-- paths the application's trusted server-side code (webhook handler,
-- checkout/portal actions, public widget runtime, rate limiter) actually
-- needs, using only the local `service_role` identity. Never adds a
-- user-facing policy to make any of this pass — every assertion below
-- that expects `authenticated` to be denied stays denied by an existing,
-- already-shipped REVOKE/policy, not by anything this test file adds.
begin;
select * from no_plan();

create temporary table fixtures (key text primary key, value uuid);
grant select on fixtures to anon, authenticated, service_role;
-- service_role also needs to record the second business id it creates
-- further down this file (see "agent_settings provisioning" below).
grant insert on fixtures to service_role;

with new_user as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    'owner-service-role-test@pgtap.test.local', 'not-a-real-hash-testing-only', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Service Role Test Owner"}'::jsonb,
    now(), now(), '', '', '', ''
  )
  returning id
)
insert into fixtures (key, value) select 'owner_id', id from new_user;

insert into fixtures (key, value)
select 'business_id', id from public.businesses where owner_id = (select value from fixtures where key = 'owner_id');

select ok(
  (select value from fixtures where key = 'business_id') is not null,
  'the test owner was auto-provisioned a business to attach billing/rate-limit fixtures to'
);

-- ---------------------------------------------------------------------
-- agent_settings provisioning: the businesses insert above (from the
-- auth.users signup trigger) already exercised on_business_created —
-- confirm exactly one agent_settings row exists for it, with the
-- documented defaults, before any owner has ever saved anything.
-- ---------------------------------------------------------------------
select is(
  (select count(*)::int from public.agent_settings where business_id = (select value from fixtures where key = 'business_id')),
  1,
  'the auto-provisioned business has exactly one agent_settings row'
);
select is(
  (select tone from public.agent_settings where business_id = (select value from fixtures where key = 'business_id')),
  'professional',
  'the auto-provisioned agent_settings row has the documented default tone'
);
select is(
  (select response_length from public.agent_settings where business_id = (select value from fixtures where key = 'business_id')),
  'balanced',
  'the auto-provisioned agent_settings row has the documented default response_length'
);
select ok(
  (select custom_instructions from public.agent_settings where business_id = (select value from fixtures where key = 'business_id')) is null,
  'the auto-provisioned agent_settings row has no custom_instructions and no demo/starter content'
);

-- ---------------------------------------------------------------------
-- service_role: billing_checkout_attempts / paddle_webhook_events /
-- widget_rate_limits
-- ---------------------------------------------------------------------
set local role service_role;

select lives_ok(
  format(
    $sql$insert into public.billing_checkout_attempts (business_id, status) values (%L, 'pending')$sql$,
    (select value from fixtures where key = 'business_id')
  ),
  'service_role can insert into billing_checkout_attempts'
);
select is(
  (select count(*)::int from public.billing_checkout_attempts where business_id = (select value from fixtures where key = 'business_id')),
  1,
  'service_role can read the billing_checkout_attempts row back'
);

select lives_ok(
  $sql$insert into public.paddle_webhook_events (paddle_event_id, event_type) values ('evt_pgtap_test_1', 'subscription.created')$sql$,
  'service_role can insert into paddle_webhook_events'
);
select is(
  (select count(*)::int from public.paddle_webhook_events where paddle_event_id = 'evt_pgtap_test_1'),
  1,
  'service_role can read the paddle_webhook_events row back'
);

select lives_ok(
  $sql$insert into public.widget_rate_limits (bucket_key, count) values ('pgtap-test-bucket', 1)$sql$,
  'service_role can insert into widget_rate_limits'
);
select is(
  (select count(*)::int from public.widget_rate_limits where bucket_key = 'pgtap-test-bucket'),
  1,
  'service_role can read the widget_rate_limits row back'
);

-- ---------------------------------------------------------------------
-- service_role: the subscription-synchronization RPC
-- (sync_business_subscription) — the one write path
-- src/lib/paddle/sync.ts uses from the webhook handler.
-- ---------------------------------------------------------------------
select lives_ok(
  format(
    $sql$select public.sync_business_subscription(
      %L::uuid, 'ctm_pgtap_test', 'sub_pgtap_test', now(), now(), 1::bigint,
      'pri_pgtap_test', 'txn_pgtap_test', 'active',
      null, null, now(), now() + interval '30 days', false, null
    )$sql$,
    (select value from fixtures where key = 'business_id')
  ),
  'service_role can call public.sync_business_subscription()'
);

select is(
  (select status from public.business_subscriptions where business_id = (select value from fixtures where key = 'business_id')),
  'active',
  'sync_business_subscription() wrote the expected status onto business_subscriptions'
);

-- ---------------------------------------------------------------------
-- service_role: the rate-limit RPCs the public widget runtime uses.
-- ---------------------------------------------------------------------
select lives_ok(
  $sql$select public.check_and_increment_rate_limit('pgtap-rate-limit-bucket', 5, 60)$sql$,
  'service_role can call public.check_and_increment_rate_limit()'
);

select ok(
  (select allowed from public.check_and_increment_rate_limit('pgtap-rate-limit-bucket', 5, 60)) = true,
  'check_and_increment_rate_limit() reports allowed for a fresh bucket under its limit'
);

select lives_ok(
  $sql$select public.cleanup_expired_widget_rate_limits(0)$sql$,
  'service_role can call public.cleanup_expired_widget_rate_limits()'
);

-- ---------------------------------------------------------------------
-- agent_settings provisioning: a genuinely NEW, direct businesses insert
-- (not the auth.users signup path already exercised above, and not
-- attached to either test owner — owner_id is nullable, matching the
-- placeholder/unowned business case) fires on_business_created and
-- provisions exactly one agent_settings row — proving the trigger
-- itself, independent of handle_new_user()'s own businesses insert.
-- ---------------------------------------------------------------------
with new_business as (
  insert into public.businesses (owner_id, name, slug, business_type, default_language, supported_languages)
  values (
    null, 'Second Business For Provisioning Test', 'pgtap-second-business-' || gen_random_uuid()::text,
    'hotel', 'en', array['en']
  )
  returning id
)
insert into fixtures (key, value) select 'second_business_id', id from new_business;

select is(
  (select count(*)::int from public.agent_settings where business_id = (select value from fixtures where key = 'second_business_id')),
  1,
  'a brand-new business insert automatically provisions exactly one agent_settings row (on_business_created trigger, not just the one-time backfill)'
);

-- Rerun-safety: the migration's own backfill statement, re-run here for
-- a business that already has an agent_settings row, is a safe no-op —
-- still exactly one row, no error, no overwrite of the (default) values
-- already there.
insert into public.agent_settings (business_id)
select id from public.businesses where id = (select value from fixtures where key = 'second_business_id')
on conflict (business_id) do nothing;

select is(
  (select count(*)::int from public.agent_settings where business_id = (select value from fixtures where key = 'second_business_id')),
  1,
  'rerunning the backfill insert for an already-provisioned business stays at exactly one row (rerun-safe)'
);

-- provision_agent_settings() cannot be invoked directly as service_role.
-- EXECUTE is revoked from public, anon, authenticated, AND service_role
-- (see the has_function_privilege assertion below, and the migration's
-- own revoke statement) -- the grant check itself blocks the call
-- before Postgres would even reach its separate "trigger functions can
-- only be called as triggers" restriction: SQLSTATE 42501, "permission
-- denied for function provision_agent_settings". The owning role
-- (sb_postgres, exempt from its own grants) is the one identity that
-- would actually reach the trigger-function restriction (SQLSTATE
-- 0A000) instead, but no application code ever runs as that role.
--
-- This specific assertion is why service_role is now in the revoke
-- list at all: the real Supabase CLI Docker stack's own database CI job
-- (this branch's GitHub Actions run) found that, before this fix,
-- service_role got 0A000 here instead of 42501 -- proof that
-- service_role had a live, unrevoked EXECUTE grant reaching all the way
-- through to Postgres's trigger-function check, not blocked by any
-- privilege check first. Root cause: this Supabase project's own
-- default privileges grant service_role, like anon/authenticated, a
-- direct EXECUTE on every newly created function -- a default this
-- suite's own from-scratch local Postgres approximation had not
-- modeled for service_role (only for anon/authenticated, per
-- 20260923090000_harden_rate_limit_rpc_grants.sql), so it passed
-- locally with the old two-role revoke while still failing for real.
select throws_ok(
  'select public.provision_agent_settings()',
  '42501',
  null,
  'provision_agent_settings() cannot be invoked directly as service_role — blocked by the revoked EXECUTE grant before Postgres''s own trigger-function restriction would even apply'
);

-- ---------------------------------------------------------------------
-- CHECK constraints are enforced even for service_role (RLS is bypassed
-- by BYPASSRLS, but CHECK constraints are not an RLS mechanism and apply
-- to every role, including service_role and the migration-owning role
-- itself) — the database-level defense-in-depth behind the application's
-- own validation in src/features/agent-settings/schemas/agent-settings.ts.
-- ---------------------------------------------------------------------
select throws_ok(
  format(
    $sql$update public.agent_settings set tone = 'sarcastic' where business_id = %L$sql$,
    (select value from fixtures where key = 'business_id')
  ),
  '23514',
  null,
  'an invalid tone value is rejected by agent_settings_tone_check'
);
select throws_ok(
  format(
    $sql$update public.agent_settings set response_length = 'verbose' where business_id = %L$sql$,
    (select value from fixtures where key = 'business_id')
  ),
  '23514',
  null,
  'an invalid response_length value is rejected by agent_settings_response_length_check'
);
select throws_ok(
  format(
    $sql$update public.agent_settings set custom_instructions = '   ' where business_id = %L$sql$,
    (select value from fixtures where key = 'business_id')
  ),
  '23514',
  null,
  'a whitespace-only custom_instructions value is rejected outright by agent_settings_custom_instructions_check — the application layer normalizes whitespace-only to NULL before ever reaching this constraint, and this proves the constraint itself does not silently accept it either'
);
select throws_ok(
  format(
    $sql$update public.agent_settings set custom_instructions = repeat('x', 4001) where business_id = %L$sql$,
    (select value from fixtures where key = 'business_id')
  ),
  '23514',
  null,
  'a custom_instructions value over 4000 characters is rejected by agent_settings_custom_instructions_check'
);
select lives_ok(
  format(
    $sql$update public.agent_settings set custom_instructions = null where business_id = %L$sql$,
    (select value from fixtures where key = 'business_id')
  ),
  'NULL custom_instructions is accepted'
);

reset role;

-- ---------------------------------------------------------------------
-- Grant-level assertions: PUBLIC/anon/authenticated lack EXECUTE and
-- service_role has it, checked directly via has_function_privilege()
-- rather than only inferred from a failed/succeeded call — the exact
-- gap that let 20260916130000_widget_rate_limits.sql's own
-- `revoke all ... from public` (without also revoking from anon/
-- authenticated) go undetected: this project's own default privileges
-- grant EXECUTE on new functions directly to anon/authenticated, which
-- revoking from PUBLIC alone never touches. See
-- 20260923090000_harden_rate_limit_rpc_grants.sql for the fix.
-- ---------------------------------------------------------------------
select is(
  (
    select count(*)::int
    from (values
      ('public', 'public.check_and_increment_rate_limit(text,integer,integer)'),
      ('anon', 'public.check_and_increment_rate_limit(text,integer,integer)'),
      ('authenticated', 'public.check_and_increment_rate_limit(text,integer,integer)'),
      ('public', 'public.cleanup_expired_widget_rate_limits(integer)'),
      ('anon', 'public.cleanup_expired_widget_rate_limits(integer)'),
      ('authenticated', 'public.cleanup_expired_widget_rate_limits(integer)')
    ) as role_fn(role_name, fn_signature)
    where has_function_privilege(role_name, fn_signature, 'EXECUTE')
  ),
  0,
  'PUBLIC, anon, and authenticated all lack EXECUTE on both rate-limit RPCs'
);

select is(
  (
    select count(*)::int
    from (values
      ('service_role', 'public.check_and_increment_rate_limit(text,integer,integer)'),
      ('service_role', 'public.cleanup_expired_widget_rate_limits(integer)')
    ) as role_fn(role_name, fn_signature)
    where has_function_privilege(role_name, fn_signature, 'EXECUTE')
  ),
  2,
  'service_role has EXECUTE on both rate-limit RPCs'
);

-- provision_agent_settings(): PUBLIC/anon/authenticated/service_role
-- all explicitly revoked (see 20260924090000_agent_settings_foundation.sql's
-- own GRANTS note). This is a trigger function -- the trigger mechanism
-- invokes it regardless of any EXECUTE grant, so no role needs one --
-- but "no role needs one" is not the same as "no role has one": the
-- real Supabase CLI Docker stack proved service_role gets a direct
-- EXECUTE grant by default on every new function, exactly like
-- anon/authenticated (see 20260923090000_harden_rate_limit_rpc_grants.sql
-- for that original finding). This assertion is what actually catches
-- that gap -- a revoke list that stopped at `public, anon, authenticated`
-- would leave this has_function_privilege('service_role', ...) check
-- reading true.
select is(
  (
    select count(*)::int
    from (values
      ('public', 'public.provision_agent_settings()'),
      ('anon', 'public.provision_agent_settings()'),
      ('authenticated', 'public.provision_agent_settings()'),
      ('service_role', 'public.provision_agent_settings()')
    ) as role_fn(role_name, fn_signature)
    where has_function_privilege(role_name, fn_signature, 'EXECUTE')
  ),
  0,
  'PUBLIC, anon, authenticated, and service_role all lack EXECUTE on provision_agent_settings() — only the trigger mechanism can call it'
);

-- ---------------------------------------------------------------------
-- authenticated: none of the above RPCs are reachable — EXECUTE was
-- revoked from PUBLIC/anon/authenticated and granted only to
-- service_role (see 20260916130000_widget_rate_limits.sql +
-- 20260923090000_harden_rate_limit_rpc_grants.sql, and
-- 20260920100000_paddle_billing_foundation.sql).
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select value from fixtures where key = 'owner_id')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

-- throws_ok's 3rd argument matches the exact error message text, which
-- this file doesn't want to pin — pass null there and put the
-- description as the 4th argument instead. 42501 (insufficient_privilege)
-- is the real SQLSTATE a revoked EXECUTE grant raises.
select throws_ok(
  $sql$select public.check_and_increment_rate_limit('pgtap-rate-limit-bucket', 5, 60)$sql$,
  '42501',
  null,
  'authenticated cannot execute check_and_increment_rate_limit() (service-role-only)'
);
select throws_ok(
  $sql$select public.cleanup_expired_widget_rate_limits(0)$sql$,
  '42501',
  null,
  'authenticated cannot execute cleanup_expired_widget_rate_limits() (service-role-only)'
);
select throws_ok(
  format(
    $sql$select public.sync_business_subscription(%L::uuid, null, null, null, null, null, null, null, 'active', null, null, null, null, false, null)$sql$,
    (select value from fixtures where key = 'business_id')
  ),
  '42501',
  null,
  'authenticated cannot execute sync_business_subscription() (service-role-only)'
);
select throws_ok(
  'select public.provision_agent_settings()',
  '42501',
  null,
  'authenticated cannot directly invoke provision_agent_settings() (trigger-only, no EXECUTE grant)'
);

-- Service-role-only tables remain inaccessible to authenticated too —
-- REVOKEd explicitly in their own migrations, not merely undefended by
-- RLS (see supabase/tests/10_rls_isolation_test.sql for the same proof
-- from an actual owner's perspective, with real business/fixture data).
select throws_ok(
  'select 1 from public.billing_checkout_attempts limit 1',
  '42501',
  null,
  'authenticated cannot select billing_checkout_attempts (service-role-only)'
);
select throws_ok(
  'select 1 from public.paddle_webhook_events limit 1',
  '42501',
  null,
  'authenticated cannot select paddle_webhook_events (service-role-only)'
);
select throws_ok(
  'select 1 from public.widget_rate_limits limit 1',
  '42501',
  null,
  'authenticated cannot select widget_rate_limits (service-role-only)'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------
-- anon: the same RPCs and tables are equally unreachable — signed-out
-- visitors are never a valid caller for any of this.
-- ---------------------------------------------------------------------
set local role anon;

select throws_ok(
  $sql$select public.check_and_increment_rate_limit('pgtap-rate-limit-bucket', 5, 60)$sql$,
  '42501',
  null,
  'anon cannot execute check_and_increment_rate_limit() (service-role-only)'
);
select throws_ok(
  $sql$select public.cleanup_expired_widget_rate_limits(0)$sql$,
  '42501',
  null,
  'anon cannot execute cleanup_expired_widget_rate_limits() (service-role-only)'
);
select throws_ok(
  'select 1 from public.billing_checkout_attempts limit 1',
  '42501',
  null,
  'anon cannot select billing_checkout_attempts (service-role-only)'
);
select throws_ok(
  'select 1 from public.paddle_webhook_events limit 1',
  '42501',
  null,
  'anon cannot select paddle_webhook_events (service-role-only)'
);
select throws_ok(
  'select 1 from public.widget_rate_limits limit 1',
  '42501',
  null,
  'anon cannot select widget_rate_limits (service-role-only)'
);
select throws_ok(
  'select public.provision_agent_settings()',
  '42501',
  null,
  'anon cannot directly invoke provision_agent_settings() (trigger-only, no EXECUTE grant)'
);

reset role;

select * from finish();
rollback;
