-- RLS and cross-business isolation — exercised through real authenticated
-- PostgreSQL/JWT context (`set local role` + the `request.jwt.claims` GUC
-- that this project's `auth.uid()` reads), never an application-level
-- mock. All data here is synthetic and non-sensitive
-- (*@pgtap.test.local addresses, placeholder content).
--
-- auth.users rows are inserted directly (minimal columns, matching what
-- Supabase's own Auth server writes on a real signup) purely to give
-- this test two real owners to authenticate as — inserting into
-- auth.users also fires the repository-owned on_auth_user_created
-- trigger exactly as a real signup would, so each owner already has a
-- provisioned businesses/widget_settings row before this file adds one
-- knowledge_items/conversations/messages/leads/handoffs row per business
-- for the isolation checks below.
begin;
select * from no_plan();

create temporary table fixtures (key text primary key, value uuid);
-- A temp table's default permissions are private to its owning role — grant
-- read access to the roles this file switches into below, or every fixture
-- lookup after the first `set local role` fails with "permission denied
-- for table fixtures" (caught by a real local run of this file).
grant select on fixtures to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Owner A and Owner B: two synthetic signups
-- ---------------------------------------------------------------------
with new_user as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    'owner-a@pgtap.test.local', 'not-a-real-hash-testing-only', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Owner A"}'::jsonb,
    now(), now(), '', '', '', ''
  )
  returning id
)
insert into fixtures (key, value) select 'owner_a_id', id from new_user;

with new_user as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    'owner-b@pgtap.test.local', 'not-a-real-hash-testing-only', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Owner B"}'::jsonb,
    now(), now(), '', '', '', ''
  )
  returning id
)
insert into fixtures (key, value) select 'owner_b_id', id from new_user;

insert into fixtures (key, value)
select 'business_a_id', id from public.businesses where owner_id = (select value from fixtures where key = 'owner_a_id');

insert into fixtures (key, value)
select 'business_b_id', id from public.businesses where owner_id = (select value from fixtures where key = 'owner_b_id');

select ok(
  (select value from fixtures where key = 'business_a_id') is not null
    and (select value from fixtures where key = 'business_b_id') is not null,
  'both owners were auto-provisioned exactly one business by the signup trigger'
);

-- One row per business in every business-scoped table this file tests,
-- inserted as postgres (bypassing RLS entirely, the same way the
-- service-role widget runtime does in production).
insert into public.knowledge_items (business_id, category, question, answer_en)
select value, 'General', 'Do you have parking?', 'Yes.' from fixtures where key = 'business_a_id';
insert into public.knowledge_items (business_id, category, question, answer_en)
select value, 'General', 'Do you have parking?', 'Yes.' from fixtures where key = 'business_b_id';

with new_conversation as (
  insert into public.conversations (business_id, visitor_id)
  select value, 'visitor-a' from fixtures where key = 'business_a_id'
  returning id
)
insert into fixtures (key, value) select 'conversation_a_id', id from new_conversation;

with new_conversation as (
  insert into public.conversations (business_id, visitor_id)
  select value, 'visitor-b' from fixtures where key = 'business_b_id'
  returning id
)
insert into fixtures (key, value) select 'conversation_b_id', id from new_conversation;

insert into public.messages (conversation_id, role, content)
select value, 'user', 'Hello' from fixtures where key = 'conversation_a_id';
insert into public.messages (conversation_id, role, content)
select value, 'user', 'Hello' from fixtures where key = 'conversation_b_id';

with new_lead as (
  insert into public.leads (business_id, conversation_id, reference, name, contact, source, status)
  select
    (select value from fixtures where key = 'business_a_id'),
    (select value from fixtures where key = 'conversation_a_id'),
    'PGTAP-LEAD-A', 'Alex Guest', 'alex@pgtap.test.local', 'website', 'new'
  returning id
)
insert into fixtures (key, value) select 'lead_a_id', id from new_lead;

with new_lead as (
  insert into public.leads (business_id, conversation_id, reference, name, contact, source, status)
  select
    (select value from fixtures where key = 'business_b_id'),
    (select value from fixtures where key = 'conversation_b_id'),
    'PGTAP-LEAD-B', 'Blair Guest', 'blair@pgtap.test.local', 'website', 'new'
  returning id
)
insert into fixtures (key, value) select 'lead_b_id', id from new_lead;

insert into public.handoffs (business_id, conversation_id, contact, status)
select value, (select value from fixtures where key = 'conversation_a_id'), 'alex@pgtap.test.local', 'new'
from fixtures where key = 'business_a_id';
insert into public.handoffs (business_id, conversation_id, contact, status)
select value, (select value from fixtures where key = 'conversation_b_id'), 'blair@pgtap.test.local', 'new'
from fixtures where key = 'business_b_id';

-- ---------------------------------------------------------------------
-- Owner A's own-data access ("according to their policies")
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select value from fixtures where key = 'owner_a_id')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

select ok(
  exists(select 1 from public.businesses where id = (select value from fixtures where key = 'business_a_id')),
  'owner A can select their own business'
);

update public.businesses set name = 'Owner A Renamed' where id = (select value from fixtures where key = 'business_a_id');

select ok(
  exists(select 1 from public.knowledge_items where business_id = (select value from fixtures where key = 'business_a_id')),
  'owner A can select their own knowledge_items'
);
select ok(
  exists(select 1 from public.conversations where business_id = (select value from fixtures where key = 'business_a_id')),
  'owner A can select their own conversations'
);
select ok(
  exists(select 1 from public.messages where conversation_id = (select value from fixtures where key = 'conversation_a_id')),
  'owner A can select their own messages'
);
select ok(
  exists(select 1 from public.leads where business_id = (select value from fixtures where key = 'business_a_id')),
  'owner A can select their own leads'
);
select ok(
  exists(select 1 from public.handoffs where business_id = (select value from fixtures where key = 'business_a_id')),
  'owner A can select their own handoffs'
);
select ok(
  exists(select 1 from public.widget_settings where business_id = (select value from fixtures where key = 'business_a_id')),
  'owner A can select their own widget_settings'
);

-- ---------------------------------------------------------------------
-- Owner A cannot see, forge, or modify owner B's protected rows
-- ---------------------------------------------------------------------
select is(
  (select count(*)::int from public.businesses where id = (select value from fixtures where key = 'business_b_id')),
  0,
  'owner A cannot select owner B''s business row'
);
select is(
  (select count(*)::int from public.knowledge_items where business_id = (select value from fixtures where key = 'business_b_id')),
  0,
  'owner A cannot select owner B''s knowledge_items'
);
select is(
  (select count(*)::int from public.conversations where business_id = (select value from fixtures where key = 'business_b_id')),
  0,
  'owner A cannot select owner B''s conversations'
);
select is(
  (select count(*)::int from public.messages where conversation_id = (select value from fixtures where key = 'conversation_b_id')),
  0,
  'owner A cannot select owner B''s messages'
);
select is(
  (select count(*)::int from public.leads where business_id = (select value from fixtures where key = 'business_b_id')),
  0,
  'owner A cannot select owner B''s leads'
);
select is(
  (select count(*)::int from public.handoffs where business_id = (select value from fixtures where key = 'business_b_id')),
  0,
  'owner A cannot select owner B''s handoffs'
);
select is(
  (select count(*)::int from public.widget_settings where business_id = (select value from fixtures where key = 'business_b_id')),
  0,
  'owner A cannot select owner B''s widget_settings'
);

-- A same-row UPDATE targeting owner B's business matches zero rows under
-- RLS rather than erroring — the correct way this denial actually
-- manifests (see this file's own header comment).
update public.businesses set name = 'Hacked By A' where id = (select value from fixtures where key = 'business_b_id');

-- A same-row DELETE targeting owner B's knowledge_items likewise matches
-- zero rows.
delete from public.knowledge_items where business_id = (select value from fixtures where key = 'business_b_id');

-- Forging business_id on INSERT is rejected outright by the WITH CHECK
-- clause — a real error, not a silent no-op.
-- throws_ok's 3rd argument matches the exact error message text, which
-- this file doesn't want to pin — pass null there and put the
-- description as the 4th argument instead. 42501 (insufficient_privilege)
-- is the real SQLSTATE both an RLS WITH CHECK violation and a bare
-- permission-denied error raise.
select throws_ok(
  format(
    $sql$insert into public.leads (business_id, reference, name, contact, source, status) values (%L, 'FORGE-1', 'Forged', 'forge@pgtap.test.local', 'website', 'new')$sql$,
    (select value from fixtures where key = 'business_b_id')
  ),
  '42501',
  null,
  'owner A cannot forge business_id to insert a lead into owner B''s business'
);

-- Owner A cannot reach any service-role-only table — REVOKEd from
-- `authenticated` entirely, so this fails at the grant check, before RLS
-- is even evaluated.
select throws_ok(
  'select 1 from public.billing_checkout_attempts limit 1',
  '42501',
  null,
  'owner A cannot select billing_checkout_attempts (service-role-only)'
);
select throws_ok(
  'select 1 from public.paddle_webhook_events limit 1',
  '42501',
  null,
  'owner A cannot select paddle_webhook_events (service-role-only)'
);
select throws_ok(
  'select 1 from public.widget_rate_limits limit 1',
  '42501',
  null,
  'owner A cannot select widget_rate_limits (service-role-only)'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- Verify, from an unrestricted (postgres) context, that neither the
-- UPDATE nor the DELETE attempted above as owner A actually changed
-- anything — the real proof that RLS denial is a database-state fact,
-- not just an empty result set.
select is(
  (select name from public.businesses where id = (select value from fixtures where key = 'business_a_id')),
  'Owner A Renamed',
  'owner A''s own UPDATE to their own business actually took effect'
);
select isnt(
  (select name from public.businesses where id = (select value from fixtures where key = 'business_b_id')),
  'Hacked By A',
  'owner B''s business name was NOT changed by owner A''s UPDATE attempt'
);
select ok(
  exists(select 1 from public.knowledge_items where business_id = (select value from fixtures where key = 'business_b_id')),
  'owner B''s knowledge_items row was NOT deleted by owner A''s DELETE attempt'
);
select is(
  (select count(*)::int from public.leads where business_id = (select value from fixtures where key = 'business_b_id') and reference = 'FORGE-1'),
  0,
  'the forged lead was never actually inserted into owner B''s business'
);

-- ---------------------------------------------------------------------
-- Repeat the core isolation assertion from owner B's perspective
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select value from fixtures where key = 'owner_b_id')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

select ok(
  exists(select 1 from public.businesses where id = (select value from fixtures where key = 'business_b_id')),
  'owner B can select their own business'
);
select is(
  (select count(*)::int from public.businesses where id = (select value from fixtures where key = 'business_a_id')),
  0,
  'owner B cannot select owner A''s business row'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------
-- anon cannot directly read private business/customer data
-- ---------------------------------------------------------------------
set local role anon;

select is(
  (select count(*)::int from public.businesses),
  0,
  'anon cannot select any business row directly (no `to anon` policy on public.businesses)'
);
select is(
  (select count(*)::int from public.knowledge_items),
  0,
  'anon cannot select any knowledge_items row directly'
);
select is(
  (select count(*)::int from public.leads),
  0,
  'anon cannot select any leads row directly'
);

reset role;

select * from finish();
rollback;
