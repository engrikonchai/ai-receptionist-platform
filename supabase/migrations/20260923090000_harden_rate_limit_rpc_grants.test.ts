import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static contract for the rate-limit RPC grant-hardening migration —
 * verified against the actual SQL text, same approach as this repo's
 * other migration tests (no live Postgres instance in this
 * environment). Not a substitute for the manual Supabase verification
 * described in the PR/report.
 *
 * This migration exists because the real local Supabase CLI stack's own
 * pgTAP suite (supabase/tests/20_service_role_test.sql) found that
 * `authenticated` could still execute
 * check_and_increment_rate_limit() after 20260916130000_widget_rate_limits.sql's
 * own `revoke all ... from public` — this project's own default
 * privileges grant EXECUTE on new functions directly to anon/
 * authenticated, which revoking from PUBLIC alone never touches.
 */
const sql = readFileSync(
  path.join(import.meta.dirname, '20260923090000_harden_rate_limit_rpc_grants.sql'),
  'utf8'
);

const executableSql = sql
  .split('\n')
  .filter((line) => !/^\s*--/.test(line))
  .join('\n');

describe('rate-limit RPC grant-hardening migration — static contract', () => {
  it('is timestamped after every other existing migration (forward-only, never edits an already-applied one)', () => {
    const ownFile = '20260923090000_harden_rate_limit_rpc_grants.sql';
    const ownTimestamp = ownFile.slice(0, 14);
    const allMigrations = readdirSync(import.meta.dirname).filter((f) => f.endsWith('.sql'));
    for (const file of allMigrations) {
      if (file === ownFile) continue;
      expect(file.slice(0, 14) <= ownTimestamp).toBe(true);
    }
  });

  it('revokes check_and_increment_rate_limit execute from public, anon, AND authenticated explicitly — not just public', () => {
    expect(sql).toMatch(
      /revoke all on function public\.check_and_increment_rate_limit\(text, integer, integer\) from public, anon, authenticated;/
    );
  });

  it('re-grants check_and_increment_rate_limit execute to service_role', () => {
    expect(sql).toMatch(
      /grant execute on function public\.check_and_increment_rate_limit\(text, integer, integer\) to service_role;/
    );
  });

  it('revokes cleanup_expired_widget_rate_limits execute from public, anon, AND authenticated explicitly — not just public', () => {
    expect(sql).toMatch(
      /revoke all on function public\.cleanup_expired_widget_rate_limits\(integer\) from public, anon, authenticated;/
    );
  });

  it('re-grants cleanup_expired_widget_rate_limits execute to service_role', () => {
    expect(sql).toMatch(
      /grant execute on function public\.cleanup_expired_widget_rate_limits\(integer\) to service_role;/
    );
  });

  it('uses the exact identity-argument signatures from 20260916130000_widget_rate_limits.sql, not an invented or guessed one', () => {
    expect(sql).toMatch(/check_and_increment_rate_limit\(text, integer, integer\)/);
    expect(sql).toMatch(/cleanup_expired_widget_rate_limits\(integer\)/);
  });

  it('touches exactly these two functions — no other function, table, column, or RLS policy', () => {
    expect(executableSql).not.toMatch(/\bcreate table\b/i);
    expect(executableSql).not.toMatch(/\balter table\b/i);
    expect(executableSql).not.toMatch(/\bcreate policy\b/i);
    expect(executableSql).not.toMatch(/\bdrop policy\b/i);
    expect(executableSql).not.toMatch(/\bcreate (or replace )?function\b/i);
    expect(executableSql).not.toMatch(/\bdrop function\b/i);
    expect(executableSql).not.toMatch(/resolve_widget_config/i);
    expect(executableSql).not.toMatch(/sync_business_subscription/i);
    expect(executableSql).not.toMatch(/handle_new_user/i);
  });

  it('never disables or weakens Row Level Security anywhere', () => {
    expect(executableSql).not.toMatch(/disable row level security/i);
    expect(executableSql).not.toMatch(/\bdrop policy\b/i);
  });

  it('never touches auth.users or any Supabase-managed auth object', () => {
    expect(executableSql).not.toMatch(/auth\.users/i);
    expect(executableSql).not.toMatch(/supabase_auth_admin/i);
    expect(executableSql).not.toMatch(/set role/i);
  });

  it('never grants anything to anon or authenticated', () => {
    expect(executableSql).not.toMatch(/grant[^;]*to[^;]*\banon\b/i);
    expect(executableSql).not.toMatch(/grant[^;]*to[^;]*\bauthenticated\b/i);
  });

  it('documents the confirmed root cause and that this is forward-only, not a rewrite of the original migration', () => {
    expect(sql).toMatch(/forward-only/i);
    expect(sql).toMatch(/default privileges/i);
    expect(sql).toMatch(/20260916130000_widget_rate_limits\.sql/);
  });
});
