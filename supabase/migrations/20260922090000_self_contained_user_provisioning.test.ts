import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static contract for the self-contained user-provisioning migration —
 * verified against the actual SQL text, same approach as this repo's
 * other migration tests (no live Postgres instance in this
 * environment). Not a substitute for the manual Supabase verification
 * described in the PR/report.
 */
const sql = readFileSync(
  path.join(import.meta.dirname, '20260922090000_self_contained_user_provisioning.sql'),
  'utf8'
);

// Same approach as this repo's other migration tests: strips full `--`
// comment lines so "never mentions X" checks assert against what the
// migration actually executes, not against its own prose.
const executableSql = sql
  .split('\n')
  .filter((line) => !/^\s*--/.test(line))
  .join('\n');

const functionStart = sql.indexOf('create or replace function public.handle_new_user()');
const functionEnd = sql.indexOf('$$;', functionStart) + '$$;'.length;
const functionBody = sql.slice(functionStart, functionEnd);

describe('self-contained user provisioning migration — static contract', () => {
  it('defines the expected provisioning function, handle_new_user, as a trigger function', () => {
    expect(functionStart).toBeGreaterThanOrEqual(0);
    expect(functionBody).toMatch(/returns trigger/i);
    expect(functionBody).toMatch(/language plpgsql/i);
  });

  it('uses a controlled, fixed search_path', () => {
    expect(functionBody).toMatch(/set search_path = public/);
  });

  it('is security definer, required for provisioning from an auth.users trigger', () => {
    expect(functionBody).toMatch(/security definer/i);
  });

  it('derives the owner/auth user id from NEW.id, never from caller-supplied input', () => {
    expect(functionBody).toMatch(/new\.id/g);
    // profiles.id and businesses.owner_id are both set from new.id.
    expect(functionBody).toMatch(/values \(new\.id, v_display_name, false\)/);
    expect(functionBody).toMatch(/where owner_id = new\.id/);
  });

  it('never trusts raw_user_meta_data for owner id, business id, or an authorization/role decision', () => {
    const metadataUses = functionBody.match(/raw_user_meta_data[^\n]*/g) ?? [];
    expect(metadataUses.length).toBeGreaterThan(0);
    for (const use of metadataUses) {
      expect(use).toMatch(/display_name/);
      expect(use).not.toMatch(/owner_id|business_id|role|is_active|admin/i);
    }
  });

  it('falls back safely when display_name metadata is missing/empty, never leaving it null-unhandled', () => {
    expect(functionBody).toMatch(/coalesce\(new\.raw_user_meta_data ->> 'display_name', ''\)/);
    expect(functionBody).toMatch(/split_part\(coalesce\(new\.email, ''\), '@', 1\)/);
    expect(functionBody).toMatch(/v_display_name := 'Owner';/);
    expect(functionBody).toMatch(/left\(v_display_name, 100\)/);
  });

  it('profile creation is idempotent — insert keyed on id with on conflict do nothing', () => {
    expect(functionBody).toMatch(
      /insert into public\.profiles \(id, display_name, onboarding_completed\)/
    );
    expect(functionBody).toMatch(/on conflict \(id\) do nothing;/);
  });

  it('business lookup/creation can never create a second owned business', () => {
    // Looks up an existing business for this owner before ever inserting.
    expect(functionBody).toMatch(
      /select id into v_business_id\s*\n\s*from public\.businesses\s*\n\s*where owner_id = new\.id/
    );
    // Only inserts inside the "no existing business" branch.
    const lookupIndex = functionBody.indexOf('if v_business_id is null then');
    const insertIndex = functionBody.indexOf('insert into public.businesses');
    expect(insertIndex).toBeGreaterThan(lookupIndex);
    // The insert itself is additionally guarded by the unique index from
    // the single-business-per-owner migration.
    expect(functionBody).toMatch(/on conflict \(owner_id\) do nothing;/);
    // Re-selects afterward so a concurrent-invocation race can never
    // proceed with a business_id that isn't a real, current row.
    const reselectCount = (functionBody.match(/select id into v_business_id/g) ?? []).length;
    expect(reselectCount).toBe(2);
  });

  it('widget_settings creation is idempotent — guarded by an explicit existence check, never an update', () => {
    expect(functionBody).toMatch(
      /if not exists \(\s*\n\s*select 1 from public\.widget_settings where business_id = v_business_id\s*\n\s*\) then/
    );
    expect(functionBody).not.toMatch(/update public\.widget_settings/i);
  });

  it('inserts zero knowledge_items rows, and documents why', () => {
    expect(executableSql).not.toMatch(/insert into public\.knowledge_items/i);
    expect(sql).toMatch(/knowledge_items/);
    expect(sql).toMatch(/resolveOnboardingResumeStep/);
  });

  it('never issues an UPDATE or DELETE against profiles, businesses, or widget_settings — existing rows and values are never overwritten or removed', () => {
    expect(executableSql).not.toMatch(/update public\.(profiles|businesses|widget_settings)\b/i);
    expect(executableSql).not.toMatch(
      /delete from public\.(profiles|businesses|widget_settings)\b/i
    );
  });

  it('never drops, alters, or truncates any table', () => {
    expect(executableSql).not.toMatch(/\bdrop table\b/i);
    expect(executableSql).not.toMatch(/\balter table\b/i);
    expect(executableSql).not.toMatch(/\btruncate\b/i);
  });

  it('the trigger is installed exactly once, replacing rather than duplicating any prior installation', () => {
    const createTriggerMatches = executableSql.match(/create trigger on_auth_user_created/gi) ?? [];
    expect(createTriggerMatches).toHaveLength(1);
    // DROP TRIGGER IF EXISTS precedes CREATE TRIGGER, targeting the same
    // explicit name, so rerunning this file always converges on exactly
    // one trigger rather than erroring or duplicating.
    const dropIndex = executableSql.indexOf('drop trigger if exists on_auth_user_created');
    const createIndex = executableSql.indexOf('create trigger on_auth_user_created');
    expect(dropIndex).toBeGreaterThanOrEqual(0);
    expect(createIndex).toBeGreaterThan(dropIndex);
  });

  it('never drops or touches any other trigger — only the one explicit, named trigger', () => {
    const dropTriggerMatches = executableSql.match(/drop trigger[^\n]*/gi) ?? [];
    expect(dropTriggerMatches).toHaveLength(1);
    expect(dropTriggerMatches[0]).toMatch(/on_auth_user_created/);
    // Never a blanket/dynamic drop of every trigger on auth.users.
    expect(executableSql).not.toMatch(/pg_trigger/i);
  });

  it('never creates, drops, or alters any RLS policy, and never disables RLS', () => {
    expect(executableSql).not.toMatch(/create policy/i);
    expect(executableSql).not.toMatch(/drop policy/i);
    expect(executableSql).not.toMatch(/alter policy/i);
    expect(executableSql).not.toMatch(/disable row level security/i);
  });

  it('grants nothing to anon or authenticated — only revokes execute from public', () => {
    expect(executableSql).not.toMatch(/grant[^;]*to[^;]*anon/i);
    expect(executableSql).not.toMatch(/grant[^;]*to[^;]*authenticated/i);
    expect(executableSql).toMatch(
      /revoke all on function public\.handle_new_user\(\) from public;/
    );
  });

  it('never logs an email address, user id, business id, or raw signup metadata', () => {
    expect(executableSql).not.toMatch(/\braise\s+(notice|warning|log)\b/i);
    // The one RAISE EXCEPTION in the function carries a fixed message,
    // never string-formats in new.email/new.id/v_business_id/etc.
    const raiseMatches = functionBody.match(/raise exception[^;]*;/gi) ?? [];
    expect(raiseMatches).toHaveLength(1);
    expect(raiseMatches[0]).not.toMatch(/new\.email|new\.id|v_business_id|%/);
  });

  it('is compatible with the applied single-business unique index, and documents that dependency', () => {
    expect(sql).toMatch(/businesses_owner_id_key/);
    expect(sql).toMatch(/single_business_per_owner/);
  });

  it('does not alter Paddle/billing behavior — never references business_subscriptions or Paddle', () => {
    expect(executableSql).not.toMatch(/business_subscriptions/i);
    expect(executableSql).not.toMatch(/paddle/i);
  });
});
