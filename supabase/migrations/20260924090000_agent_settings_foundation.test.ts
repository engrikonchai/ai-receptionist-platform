import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static contract for the agent-settings foundation migration --
 * verified against the actual SQL text, same approach as this repo's
 * other migration tests (no live Postgres instance in this
 * environment). Not a substitute for the real pgTAP assertions in
 * supabase/tests/00_schema_contract_test.sql,
 * supabase/tests/10_rls_isolation_test.sql, and
 * supabase/tests/20_service_role_test.sql, nor for the manual Supabase
 * verification described in the PR/report.
 */
const sql = readFileSync(
  path.join(import.meta.dirname, '20260924090000_agent_settings_foundation.sql'),
  'utf8'
);

const executableSql = sql
  .split('\n')
  .filter((line) => !/^\s*--/.test(line))
  .join('\n');

describe('agent-settings foundation migration -- static contract', () => {
  it('creates agent_settings as an additive, rerun-safe table', () => {
    expect(sql).toMatch(/create table if not exists public\.agent_settings/);
  });

  it('has exactly the foundational columns this milestone specifies, with the required defaults/nullability', () => {
    const tableStart = sql.indexOf('create table if not exists public.agent_settings');
    const tableEnd = sql.indexOf(');', sql.indexOf('agent_settings_custom_instructions_check'));
    const columnsSql = sql.slice(tableStart, tableEnd);

    expect(columnsSql).toMatch(/id uuid primary key default gen_random_uuid\(\)/);
    expect(columnsSql).toMatch(
      /business_id uuid not null references public\.businesses \(id\) on delete cascade/
    );
    expect(columnsSql).toMatch(/tone text not null default 'professional'/);
    expect(columnsSql).toMatch(/response_length text not null default 'balanced'/);
    expect(columnsSql).toMatch(/custom_instructions text,/);
    expect(columnsSql).toMatch(/configured_at timestamptz,/);
    expect(columnsSql).toMatch(/created_at timestamptz not null default now\(\)/);
    expect(columnsSql).toMatch(/updated_at timestamptz not null default now\(\)/);
  });

  it('declares a named UNIQUE constraint on business_id (exactly one row per business)', () => {
    expect(sql).toMatch(/constraint agent_settings_business_id_key unique \(business_id\)/);
  });

  it('the FK to businesses is ON DELETE CASCADE', () => {
    expect(sql).toMatch(/references public\.businesses \(id\) on delete cascade/);
  });

  it('CHECK-constrains tone to exactly professional/friendly/warm', () => {
    expect(sql).toMatch(
      /constraint agent_settings_tone_check\s+check \(tone in \('professional', 'friendly', 'warm'\)\)/
    );
  });

  it('CHECK-constrains response_length to exactly concise/balanced/detailed', () => {
    expect(sql).toMatch(
      /constraint agent_settings_response_length_check\s+check \(response_length in \('concise', 'balanced', 'detailed'\)\)/
    );
  });

  it('CHECK-constrains custom_instructions to NULL or a trimmed length of 1-4000, rejecting whitespace-only', () => {
    expect(sql).toMatch(/constraint agent_settings_custom_instructions_check/);
    expect(sql).toMatch(/custom_instructions is null/);
    expect(sql).toMatch(/length\(btrim\(custom_instructions\)\) between 1 and 4000/);
  });

  it('never adds a provider, model, API key, temperature, system-prompt, token-limit, or pricing column', () => {
    const tableStart = sql.indexOf('create table if not exists public.agent_settings');
    const tableEnd = sql.indexOf(');', sql.indexOf('agent_settings_custom_instructions_check'));
    const columnsSql = sql.slice(tableStart, tableEnd);

    expect(columnsSql).not.toMatch(/\bprovider\b/i);
    expect(columnsSql).not.toMatch(/\bmodel\b/i);
    expect(columnsSql).not.toMatch(/api[_\s]?key/i);
    expect(columnsSql).not.toMatch(/temperature/i);
    expect(columnsSql).not.toMatch(/system[_\s]?prompt/i);
    expect(columnsSql).not.toMatch(/token/i);
    expect(columnsSql).not.toMatch(/pricing/i);
  });

  it('never duplicates an existing widget/handoff/language/business field name', () => {
    for (const forbidden of [
      'welcome_message',
      'primary_color',
      'allowed_origins',
      'handoff_email',
      'supported_languages',
      'default_language'
    ]) {
      expect(executableSql).not.toContain(forbidden);
    }
  });

  it('uses the existing shared set_updated_at() trigger, not a new function', () => {
    expect(sql).toMatch(/drop trigger if exists set_updated_at on public\.agent_settings/);
    expect(sql).toMatch(
      /create trigger set_updated_at\s+before update on public\.agent_settings\s+for each row\s+execute function public\.set_updated_at\(\)/
    );
    expect(executableSql).not.toMatch(/create (or replace )?function public\.set_updated_at/);
  });

  it('enables Row Level Security', () => {
    expect(sql).toMatch(/alter table public\.agent_settings enable row level security;/);
  });

  it('creates only owner SELECT and owner UPDATE policies -- no owner INSERT or DELETE policy', () => {
    expect(sql).toMatch(/create policy "agent_settings_select_own"/);
    expect(sql).toMatch(/create policy "agent_settings_update_own"/);
    expect(sql).not.toMatch(/create policy "agent_settings_insert_own"/);
    expect(sql).not.toMatch(/create policy "agent_settings_delete_own"/);
    expect(sql).not.toMatch(/for insert/i);
    expect(sql).not.toMatch(/for delete/i);
  });

  it('scopes both policies through businesses.owner_id = auth.uid(), never a client-supplied owner id', () => {
    const policyBlock = sql.slice(sql.indexOf('create policy "agent_settings_select_own"'));
    expect(policyBlock).toMatch(/b\.owner_id = auth\.uid\(\)/);
    expect(policyBlock).not.toMatch(/business_id = '/);
  });

  it('the UPDATE policy has a matching WITH CHECK, not just USING', () => {
    const updateStart = sql.indexOf('create policy "agent_settings_update_own"');
    const updateBlock = sql.slice(updateStart, updateStart + 700);
    expect(updateBlock).toMatch(/with check \(/);
  });

  it('backfills exactly one row per existing business, rerun-safe and additive only', () => {
    expect(sql).toMatch(
      /insert into public\.agent_settings \(business_id\)\s+select b\.id\s+from public\.businesses b\s+on conflict \(business_id\) do nothing;/
    );
    expect(executableSql).not.toMatch(/update public\.agent_settings/i);
    expect(executableSql).not.toMatch(/delete from public\.agent_settings/i);
  });

  it('provisions future businesses via a dedicated trigger on businesses, not by touching handle_new_user()', () => {
    expect(sql).toMatch(/create or replace function public\.provision_agent_settings/);
    expect(sql).toMatch(/returns trigger/);
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/set search_path = public/);
    expect(sql).toMatch(/drop trigger if exists on_business_created on public\.businesses;/);
    expect(sql).toMatch(
      /create trigger on_business_created\s+after insert on public\.businesses\s+for each row\s+execute function public\.provision_agent_settings\(\);/
    );
    expect(executableSql).not.toMatch(/create (or replace )?function public\.handle_new_user/i);
    expect(executableSql).not.toMatch(/after insert on auth\.users/i);
    expect(executableSql).not.toMatch(/create trigger on_auth_user_created/i);
  });

  it("the provisioning trigger's own insert is duplicate/concurrency-safe via ON CONFLICT", () => {
    const fnStart = sql.indexOf('create or replace function public.provision_agent_settings');
    const fnEnd = sql.indexOf('$$;', fnStart);
    const body = sql.slice(fnStart, fnEnd);
    expect(body).toMatch(/insert into public\.agent_settings \(business_id\)/);
    expect(body).toMatch(/on conflict \(business_id\) do nothing/);
  });

  it('revokes EXECUTE on the provisioning function from public, anon, AND authenticated explicitly', () => {
    expect(sql).toMatch(
      /revoke all on function public\.provision_agent_settings\(\) from public, anon, authenticated;/
    );
  });

  it('never grants anything to anon or authenticated anywhere in this file', () => {
    expect(executableSql).not.toMatch(/grant[^;]*to[^;]*\banon\b/i);
    expect(executableSql).not.toMatch(/grant[^;]*to[^;]*\bauthenticated\b/i);
  });

  it('never seeds demo/starter content -- the backfill inserts only business_id, relying on column defaults', () => {
    expect(executableSql).not.toMatch(/mention that parking/i);
    expect(executableSql).not.toMatch(/hotel/i);
    expect(executableSql).not.toMatch(/custom_instructions\s*\)\s*\n?\s*values/i);
  });

  it('never touches auth.users or any other existing table/policy/trigger', () => {
    expect(executableSql).not.toMatch(/auth\.users/i);
    expect(executableSql).not.toMatch(/\balter table public\.widget_settings\b/i);
    expect(executableSql).not.toMatch(/\balter table public\.knowledge_items\b/i);
    expect(executableSql).not.toMatch(/disable row level security/i);
    expect(executableSql).not.toMatch(/\bdrop table\b/i);
  });

  it('is timestamped after every migration that predates it (forward-only)', () => {
    // A fixed list of the migrations that actually existed when this
    // file was written, not a live directory scan — see the identical
    // note in 20260923090000_harden_rate_limit_rpc_grants.test.ts for
    // why: scanning the live directory would make this test fail every
    // time a future milestone adds a later migration, which is exactly
    // backwards for a "forward-only" check. Still catches the real
    // regression this test cares about: one of these prior migrations
    // being renamed to a timestamp at or after this one.
    const ownTimestamp = '20260924090000';
    const priorMigrationFiles = [
      '20260910090000_self_contained_database_baseline.sql',
      '20260915000100_platform_onboarding.sql',
      '20260915170200_inbox_human_replies.sql',
      '20260915184700_knowledge_items_owner_policies.sql',
      '20260915193000_repair_live_rls_policies.sql',
      '20260916120000_widget_allowed_origins.sql',
      '20260916130000_widget_rate_limits.sql',
      '20260917140000_widget_installation_confirmed.sql',
      '20260918090000_handoff_idempotency.sql',
      '20260920100000_paddle_billing_foundation.sql',
      '20260921090000_single_business_per_owner.sql',
      '20260922090000_self_contained_user_provisioning.sql',
      '20260923090000_harden_rate_limit_rpc_grants.sql'
    ];
    const allMigrations = new Set(
      readdirSync(import.meta.dirname).filter((f) => f.endsWith('.sql'))
    );

    for (const file of priorMigrationFiles) {
      expect(allMigrations.has(file)).toBe(true);
      expect(file.slice(0, 14) < ownTimestamp).toBe(true);
    }
  });
});
