-- Schema contract — live pg_catalog/information_schema assertions against
-- an actually-applied migration chain (run via `supabase test db` after
-- `supabase db reset`), not the SQL source text. This is the runtime
-- counterpart to the static `.test.ts` contract each migration file
-- already carries — it proves the migrations, once genuinely applied to
-- a blank Postgres instance, produce exactly the catalog shape they
-- claim to.
begin;
select * from no_plan();

-- =====================================================================
-- Helpers (session-local; gone once this transaction ends)
--
-- Built on pg_catalog (pg_constraint/pg_class/pg_namespace/pg_attribute),
-- never information_schema. information_schema's FK-related views
-- (key_column_usage, constraint_column_usage, referential_constraints)
-- are privilege-filtered: a row for a given constraint is only visible
-- to the querying role if that role owns, or holds an explicit
-- column-level privilege on, BOTH sides of the constraint. auth.users is
-- owned by supabase_auth_admin, not the role migrations/tests connect
-- as — confirmed locally: the exact information_schema join this file
-- used before returns zero rows for a non-superuser role with no
-- explicit grant on auth.users, even though the FK genuinely exists
-- (`pg_get_constraintdef()` still shows it correctly for that same
-- role). pg_catalog carries no such filter — SELECT on it is granted to
-- PUBLIC unconditionally — so every helper below reads pg_constraint
-- directly and resolves both the referencing and referenced sides via
-- pg_class/pg_namespace/pg_attribute, regardless of who owns what.
-- =====================================================================
create or replace function pg_temp.fk_target(p_schema text, p_table text, p_column text)
returns text
language sql
as $$
  select tgt_ns.nspname || '.' || tgt_cls.relname
  from pg_constraint con
  join pg_class src_cls on src_cls.oid = con.conrelid
  join pg_namespace src_ns on src_ns.oid = src_cls.relnamespace
  join pg_attribute src_att on src_att.attrelid = con.conrelid and src_att.attnum = con.conkey[1]
  join pg_class tgt_cls on tgt_cls.oid = con.confrelid
  join pg_namespace tgt_ns on tgt_ns.oid = tgt_cls.relnamespace
  where con.contype = 'f'
    and src_ns.nspname = p_schema
    and src_cls.relname = p_table
    and src_att.attname = p_column
    and cardinality(con.conkey) = 1
  limit 1;
$$;

create or replace function pg_temp.fk_target_column(p_schema text, p_table text, p_column text)
returns text
language sql
as $$
  select tgt_att.attname
  from pg_constraint con
  join pg_class src_cls on src_cls.oid = con.conrelid
  join pg_namespace src_ns on src_ns.oid = src_cls.relnamespace
  join pg_attribute src_att on src_att.attrelid = con.conrelid and src_att.attnum = con.conkey[1]
  join pg_attribute tgt_att on tgt_att.attrelid = con.confrelid and tgt_att.attnum = con.confkey[1]
  where con.contype = 'f'
    and src_ns.nspname = p_schema
    and src_cls.relname = p_table
    and src_att.attname = p_column
    and cardinality(con.conkey) = 1
  limit 1;
$$;

create or replace function pg_temp.fk_delete_rule(p_schema text, p_table text, p_column text)
returns text
language sql
as $$
  select case con.confdeltype
    when 'a' then 'NO ACTION'
    when 'r' then 'RESTRICT'
    when 'c' then 'CASCADE'
    when 'n' then 'SET NULL'
    when 'd' then 'SET DEFAULT'
  end
  from pg_constraint con
  join pg_class src_cls on src_cls.oid = con.conrelid
  join pg_namespace src_ns on src_ns.oid = src_cls.relnamespace
  join pg_attribute src_att on src_att.attrelid = con.conrelid and src_att.attnum = con.conkey[1]
  where con.contype = 'f'
    and src_ns.nspname = p_schema
    and src_cls.relname = p_table
    and src_att.attname = p_column
    and cardinality(con.conkey) = 1
  limit 1;
$$;

-- The exact, human-readable constraint definition pg_get_constraintdef()
-- produces — a second, belt-and-suspenders proof for the one FK this
-- migration's first revision got wrong (see REVISION 2 in
-- 20260910090000_self_contained_database_baseline.sql): profiles.id ->
-- auth.users(id) ON DELETE CASCADE.
create or replace function pg_temp.fk_constraintdef(p_schema text, p_table text, p_column text)
returns text
language sql
as $$
  select pg_get_constraintdef(con.oid)
  from pg_constraint con
  join pg_class src_cls on src_cls.oid = con.conrelid
  join pg_namespace src_ns on src_ns.oid = src_cls.relnamespace
  join pg_attribute src_att on src_att.attrelid = con.conrelid and src_att.attnum = con.conkey[1]
  where con.contype = 'f'
    and src_ns.nspname = p_schema
    and src_cls.relname = p_table
    and src_att.attname = p_column
    and cardinality(con.conkey) = 1
  limit 1;
$$;

-- =====================================================================
-- Foundational tables exist
-- =====================================================================
select ok(to_regclass('public.profiles') is not null, 'public.profiles exists');
select ok(to_regclass('public.businesses') is not null, 'public.businesses exists');
select ok(to_regclass('public.knowledge_items') is not null, 'public.knowledge_items exists');
select ok(to_regclass('public.widget_settings') is not null, 'public.widget_settings exists');
select ok(to_regclass('public.conversations') is not null, 'public.conversations exists');
select ok(to_regclass('public.messages') is not null, 'public.messages exists');
select ok(to_regclass('public.leads') is not null, 'public.leads exists');
select ok(to_regclass('public.handoffs') is not null, 'public.handoffs exists');

-- =====================================================================
-- Billing/internal tables exist (owned by their own later migrations,
-- not the baseline — still asserted here since a fresh database must
-- have all of them once the full chain applies)
-- =====================================================================
select ok(to_regclass('public.business_subscriptions') is not null, 'public.business_subscriptions exists');
select ok(to_regclass('public.billing_checkout_attempts') is not null, 'public.billing_checkout_attempts exists');
select ok(to_regclass('public.paddle_webhook_events') is not null, 'public.paddle_webhook_events exists');
select ok(to_regclass('public.widget_rate_limits') is not null, 'public.widget_rate_limits exists');

-- =====================================================================
-- agent_settings — future-facing AI behavioral configuration only, owned
-- by 20260924090000_agent_settings_foundation.sql. See this file's own
-- assertions below for its FK/UNIQUE/CHECK constraints, RLS policies,
-- and provisioning trigger.
-- =====================================================================
select ok(to_regclass('public.agent_settings') is not null, 'public.agent_settings exists');

-- =====================================================================
-- Verified foreign key targets and ON DELETE rules
-- =====================================================================
-- profiles.id -> auth.users(id) ON DELETE CASCADE — proven four
-- independent ways: referenced table, referenced column, delete
-- action, and the full pg_get_constraintdef() text.
select is(pg_temp.fk_target('public', 'profiles', 'id'), 'auth.users', 'profiles.id references auth.users (referenced table)');
select is(pg_temp.fk_target_column('public', 'profiles', 'id'), 'id', 'profiles.id references auth.users.id (referenced column)');
select is(pg_temp.fk_delete_rule('public', 'profiles', 'id'), 'CASCADE', 'profiles.id -> auth.users is ON DELETE CASCADE (delete action)');
select is(
  pg_temp.fk_constraintdef('public', 'profiles', 'id'),
  'FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE',
  'profiles.id -> auth.users(id) ON DELETE CASCADE (full constraint definition)'
);

select is(pg_temp.fk_target('public', 'businesses', 'owner_id'), 'public.profiles', 'businesses.owner_id references public.profiles, not auth.users');
select is(pg_temp.fk_delete_rule('public', 'businesses', 'owner_id'), 'CASCADE', 'businesses.owner_id -> profiles is ON DELETE CASCADE');

select is(pg_temp.fk_target('public', 'knowledge_items', 'business_id'), 'public.businesses', 'knowledge_items.business_id references public.businesses');
select is(pg_temp.fk_delete_rule('public', 'knowledge_items', 'business_id'), 'CASCADE', 'knowledge_items.business_id -> businesses is ON DELETE CASCADE');

select is(pg_temp.fk_target('public', 'conversations', 'business_id'), 'public.businesses', 'conversations.business_id references public.businesses');
select is(pg_temp.fk_delete_rule('public', 'conversations', 'business_id'), 'CASCADE', 'conversations.business_id -> businesses is ON DELETE CASCADE');

select is(pg_temp.fk_target('public', 'messages', 'conversation_id'), 'public.conversations', 'messages.conversation_id references public.conversations');
select is(pg_temp.fk_delete_rule('public', 'messages', 'conversation_id'), 'CASCADE', 'messages.conversation_id -> conversations is ON DELETE CASCADE');

select is(pg_temp.fk_target('public', 'leads', 'business_id'), 'public.businesses', 'leads.business_id references public.businesses');
select is(pg_temp.fk_delete_rule('public', 'leads', 'business_id'), 'CASCADE', 'leads.business_id -> businesses is ON DELETE CASCADE');

select is(pg_temp.fk_target('public', 'leads', 'conversation_id'), 'public.conversations', 'leads.conversation_id references public.conversations');
select is(pg_temp.fk_delete_rule('public', 'leads', 'conversation_id'), 'SET NULL', 'leads.conversation_id -> conversations is ON DELETE SET NULL');

select is(pg_temp.fk_target('public', 'handoffs', 'business_id'), 'public.businesses', 'handoffs.business_id references public.businesses');
select is(pg_temp.fk_delete_rule('public', 'handoffs', 'business_id'), 'CASCADE', 'handoffs.business_id -> businesses is ON DELETE CASCADE');

select is(pg_temp.fk_target('public', 'handoffs', 'conversation_id'), 'public.conversations', 'handoffs.conversation_id references public.conversations');
select is(pg_temp.fk_delete_rule('public', 'handoffs', 'conversation_id'), 'SET NULL', 'handoffs.conversation_id -> conversations is ON DELETE SET NULL');

select is(pg_temp.fk_target('public', 'widget_settings', 'business_id'), 'public.businesses', 'widget_settings.business_id references public.businesses');
select is(pg_temp.fk_delete_rule('public', 'widget_settings', 'business_id'), 'CASCADE', 'widget_settings.business_id -> businesses is ON DELETE CASCADE');

select is(pg_temp.fk_target('public', 'business_subscriptions', 'business_id'), 'public.businesses', 'business_subscriptions.business_id references public.businesses');
select is(pg_temp.fk_delete_rule('public', 'business_subscriptions', 'business_id'), 'CASCADE', 'business_subscriptions.business_id -> businesses is ON DELETE CASCADE');

select is(pg_temp.fk_target('public', 'billing_checkout_attempts', 'business_id'), 'public.businesses', 'billing_checkout_attempts.business_id references public.businesses');
select is(pg_temp.fk_delete_rule('public', 'billing_checkout_attempts', 'business_id'), 'CASCADE', 'billing_checkout_attempts.business_id -> businesses is ON DELETE CASCADE');

select is(pg_temp.fk_target('public', 'agent_settings', 'business_id'), 'public.businesses', 'agent_settings.business_id references public.businesses');
select is(pg_temp.fk_delete_rule('public', 'agent_settings', 'business_id'), 'CASCADE', 'agent_settings.business_id -> businesses is ON DELETE CASCADE');

-- =====================================================================
-- Real named UNIQUE constraints (pg_constraint contype='u'), not merely
-- standalone unique indexes
-- =====================================================================
select ok(
  exists(select 1 from pg_constraint where conrelid = 'public.businesses'::regclass and conname = 'businesses_slug_key' and contype = 'u'),
  'businesses_slug_key is a real UNIQUE constraint'
);
select ok(
  exists(select 1 from pg_constraint where conrelid = 'public.businesses'::regclass and conname = 'businesses_public_widget_id_key' and contype = 'u'),
  'businesses_public_widget_id_key is a real UNIQUE constraint'
);
select ok(
  exists(select 1 from pg_constraint where conrelid = 'public.leads'::regclass and conname = 'leads_reference_key' and contype = 'u'),
  'leads_reference_key is a real UNIQUE constraint'
);
select ok(
  exists(select 1 from pg_constraint where conrelid = 'public.widget_settings'::regclass and conname = 'widget_settings_business_id_key' and contype = 'u'),
  'widget_settings_business_id_key is a real UNIQUE constraint'
);
select ok(
  exists(select 1 from pg_constraint where conrelid = 'public.agent_settings'::regclass and conname = 'agent_settings_business_id_key' and contype = 'u'),
  'agent_settings_business_id_key is a real UNIQUE constraint (exactly one row per business)'
);

-- businesses_owner_id_key remains the intentionally PARTIAL unique
-- index owned by 20260921090000_single_business_per_owner.sql — never a
-- pg_constraint row, only an index with a predicate.
select ok(
  not exists(select 1 from pg_constraint where conname = 'businesses_owner_id_key'),
  'businesses_owner_id_key is NOT a table constraint'
);
select ok(
  exists(
    select 1
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
    where c.relname = 'businesses_owner_id_key'
      and i.indisunique
      and i.indpred is not null
  ),
  'businesses_owner_id_key is a partial unique index (predicate present)'
);

-- =====================================================================
-- Verified CHECK constraints, by exact name
-- =====================================================================
select ok(exists(select 1 from pg_constraint where conname = 'businesses_supported_languages_not_empty' and contype = 'c'), 'businesses_supported_languages_not_empty exists');
select ok(exists(select 1 from pg_constraint where conname = 'conversations_channel_check' and contype = 'c'), 'conversations_channel_check exists');
select ok(exists(select 1 from pg_constraint where conname = 'conversations_status_check' and contype = 'c'), 'conversations_status_check exists');
select ok(exists(select 1 from pg_constraint where conname = 'messages_content_length_check' and contype = 'c'), 'messages_content_length_check exists');
select ok(exists(select 1 from pg_constraint where conname = 'messages_role_check' and contype = 'c'), 'messages_role_check exists');
select ok(exists(select 1 from pg_constraint where conname = 'messages_sender_type_check' and contype = 'c'), 'messages_sender_type_check exists (owned by 20260915170200_inbox_human_replies.sql)');
select ok(exists(select 1 from pg_constraint where conname = 'leads_dates_check' and contype = 'c'), 'leads_dates_check exists');
select ok(exists(select 1 from pg_constraint where conname = 'leads_guest_count_check' and contype = 'c'), 'leads_guest_count_check exists');
select ok(exists(select 1 from pg_constraint where conname = 'leads_source_check' and contype = 'c'), 'leads_source_check exists');
select ok(exists(select 1 from pg_constraint where conname = 'leads_status_check' and contype = 'c'), 'leads_status_check exists');
select ok(exists(select 1 from pg_constraint where conname = 'handoffs_status_check' and contype = 'c'), 'handoffs_status_check exists');
select ok(exists(select 1 from pg_constraint where conname = 'widget_settings_position_check' and contype = 'c'), 'widget_settings_position_check exists');
select ok(exists(select 1 from pg_constraint where conname = 'agent_settings_tone_check' and contype = 'c'), 'agent_settings_tone_check exists');
select ok(exists(select 1 from pg_constraint where conname = 'agent_settings_response_length_check' and contype = 'c'), 'agent_settings_response_length_check exists');
select ok(exists(select 1 from pg_constraint where conname = 'agent_settings_custom_instructions_check' and contype = 'c'), 'agent_settings_custom_instructions_check exists');

-- agent_settings.tone / response_length: exact default values.
select is(
  (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'agent_settings' and column_name = 'tone'),
  '''professional''::text',
  'agent_settings.tone defaults to professional'
);
select is(
  (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'agent_settings' and column_name = 'response_length'),
  '''balanced''::text',
  'agent_settings.response_length defaults to balanced'
);
select ok(
  (select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'agent_settings' and column_name = 'custom_instructions') = 'YES',
  'agent_settings.custom_instructions is nullable'
);
select ok(
  (select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'agent_settings' and column_name = 'configured_at') = 'YES',
  'agent_settings.configured_at is nullable'
);

-- =====================================================================
-- set_updated_at(): SECURITY INVOKER, and its 8 verified triggers
-- =====================================================================
select ok(
  exists(
    select 1 from pg_proc
    where proname = 'set_updated_at'
      and pronamespace = 'public'::regnamespace
      and prosecdef = false
  ),
  'public.set_updated_at() is SECURITY INVOKER (prosecdef = false)'
);

select is(
  (
    select count(*)::int
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where t.tgname = 'set_updated_at'
      and n.nspname = 'public'
      and not t.tgisinternal
  ),
  8,
  'exactly 8 set_updated_at triggers exist (profiles, businesses, knowledge_items, conversations, leads, handoffs, widget_settings, agent_settings)'
);

select ok(
  not exists(
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where c.relname = 'messages' and t.tgname = 'set_updated_at'
  ),
  'messages has no set_updated_at trigger'
);

-- =====================================================================
-- Repository-owned signup trigger: exists exactly once, calls
-- handle_new_user()
-- =====================================================================
select is(
  (select count(*)::int from pg_trigger where tgname = 'on_auth_user_created' and not tgisinternal),
  1,
  'on_auth_user_created trigger exists exactly once on auth.users'
);

select is(
  (
    select p.proname
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    where t.tgname = 'on_auth_user_created' and not t.tgisinternal
  ),
  'handle_new_user',
  'on_auth_user_created calls public.handle_new_user()'
);

-- =====================================================================
-- Repository-owned agent_settings provisioning trigger: a small,
-- dedicated AFTER INSERT trigger on public.businesses (not a rewrite of
-- on_auth_user_created/handle_new_user() above) — exists exactly once,
-- calls provision_agent_settings().
-- =====================================================================
select is(
  (
    select count(*)::int
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where c.relname = 'businesses' and t.tgname = 'on_business_created' and not t.tgisinternal
  ),
  1,
  'on_business_created trigger exists exactly once on public.businesses'
);

select is(
  (
    select p.proname
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid
    where c.relname = 'businesses' and t.tgname = 'on_business_created' and not t.tgisinternal
  ),
  'provision_agent_settings',
  'on_business_created calls public.provision_agent_settings()'
);

-- =====================================================================
-- RLS enabled on every business-scoped/internal table
-- =====================================================================
select is(
  (
    select count(*)::int
    from pg_class
    where relnamespace = 'public'::regnamespace
      and relname in (
        'profiles', 'businesses', 'knowledge_items', 'conversations', 'messages',
        'leads', 'handoffs', 'widget_settings', 'agent_settings',
        'business_subscriptions', 'billing_checkout_attempts', 'paddle_webhook_events', 'widget_rate_limits'
      )
      and relrowsecurity
  ),
  13,
  'Row Level Security is enabled on all 9 foundational tables and all 4 billing/internal tables'
);

-- =====================================================================
-- Expected owner-scoped policies exist by exact name, and nothing extra
-- =====================================================================
select is(
  (select count(*)::int from pg_policies where schemaname = 'public'),
  28,
  'exactly 28 RLS policies exist across all foundational + business_subscriptions + agent_settings tables'
);

select is(
  (
    select count(*)::int
    from (values
      ('profiles', 'profiles_select_own'),
      ('profiles', 'profiles_update_own'),
      ('businesses', 'businesses_select_own'),
      ('businesses', 'businesses_insert_own'),
      ('businesses', 'businesses_update_own'),
      ('businesses', 'businesses_delete_own'),
      ('knowledge_items', 'knowledge_items_select_own'),
      ('knowledge_items', 'knowledge_items_insert_own'),
      ('knowledge_items', 'knowledge_items_update_own'),
      ('knowledge_items', 'knowledge_items_delete_own'),
      ('conversations', 'conversations_select_own'),
      ('conversations', 'conversations_update_own'),
      ('conversations', 'conversations_delete_own'),
      ('messages', 'messages_select_own'),
      ('messages', 'messages_delete_own'),
      ('messages', 'messages_insert_owner_human_reply'),
      ('leads', 'leads_select_own'),
      ('leads', 'leads_insert_own'),
      ('leads', 'leads_update_own'),
      ('leads', 'leads_delete_own'),
      ('handoffs', 'handoffs_select_own'),
      ('handoffs', 'handoffs_update_own'),
      ('handoffs', 'handoffs_delete_own'),
      ('widget_settings', 'widget_settings_select_own'),
      ('widget_settings', 'widget_settings_update_own'),
      ('agent_settings', 'agent_settings_select_own'),
      ('agent_settings', 'agent_settings_update_own'),
      ('business_subscriptions', 'business_subscriptions_select_own')
    ) as expected(tbl, pol)
    where exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = expected.tbl and policyname = expected.pol
    )
  ),
  28,
  'every expected owner-scoped policy exists under its exact name'
);

-- agent_settings never has an owner-facing INSERT or DELETE policy — the
-- row is only ever created by provision_agent_settings() (SECURITY
-- DEFINER) and never deleted by the app.
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'agent_settings' and cmd in ('INSERT', 'DELETE')),
  0,
  'agent_settings has zero INSERT/DELETE policies'
);

-- =====================================================================
-- Service-role-only tables: zero user-facing policies
-- =====================================================================
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename in ('billing_checkout_attempts', 'paddle_webhook_events', 'widget_rate_limits')),
  0,
  'billing_checkout_attempts, paddle_webhook_events, and widget_rate_limits have zero RLS policies (default deny to every non-service-role identity)'
);

select * from finish();
rollback;
