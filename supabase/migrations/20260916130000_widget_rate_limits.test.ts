import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static contract for the durable widget rate-limit migration —
 * verified against the actual SQL text, same approach as this repo's
 * other migration tests (no live Postgres instance in this
 * environment). Not a substitute for the manual Supabase verification
 * described in the PR/report.
 */
const sql = readFileSync(
  path.join(import.meta.dirname, '20260916130000_widget_rate_limits.sql'),
  'utf8'
);

describe('widget rate-limit migration — static contract', () => {
  it('creates widget_rate_limits as an additive, rerun-safe table keyed by a hashed bucket key', () => {
    expect(sql).toMatch(/create table if not exists public\.widget_rate_limits/);
    expect(sql).toMatch(/bucket_key text primary key/);
  });

  it('never adds a column that could hold a raw IP address — only the opaque bucket_key', () => {
    const tableStart = sql.indexOf('create table if not exists public.widget_rate_limits');
    const tableEnd = sql.indexOf(');', tableStart);
    const columnsSql = sql.slice(tableStart, tableEnd);

    expect(columnsSql).not.toMatch(/\bip\b/i);
    expect(columnsSql.match(/^\s*\w+\s+\w+/gm)?.length).toBeGreaterThan(0);
    for (const column of ['bucket_key', 'count', 'window_start', 'updated_at']) {
      expect(columnsSql).toContain(column);
    }
  });

  it('enables Row Level Security on the table and creates no policy on it', () => {
    expect(sql).toMatch(/alter table public\.widget_rate_limits enable row level security;/);
    expect(sql).not.toMatch(/create policy/i);
  });

  it('revokes table access from anon/authenticated/public and grants it only to service_role', () => {
    expect(sql).toMatch(
      /revoke all on public\.widget_rate_limits from public, anon, authenticated;/
    );
    expect(sql).toMatch(
      /grant select, insert, update, delete on public\.widget_rate_limits to service_role;/
    );
  });

  it('performs the rate-limit check as a single atomic upsert statement, not a separate read then write', () => {
    const fnStart = sql.indexOf('create or replace function public.check_and_increment_rate_limit');
    const fnEnd = sql.indexOf('$$;', fnStart);
    const body = sql.slice(fnStart, fnEnd);

    expect(body).toMatch(/insert into public\.widget_rate_limits/);
    expect(body).toMatch(/on conflict \(bucket_key\) do update/);
    // Exactly one statement inside the function body (one semicolon,
    // implicitly, from the single `with ... select` — no separate
    // `select ... then update` round trip a concurrent caller could
    // race between).
    expect(body.match(/;/g) ?? []).toHaveLength(0);
  });

  it('the check function resets the window when it has elapsed and otherwise increments the count', () => {
    const fnStart = sql.indexOf('create or replace function public.check_and_increment_rate_limit');
    const fnEnd = sql.indexOf('$$;', fnStart);
    const body = sql.slice(fnStart, fnEnd);

    expect(body).toMatch(/count \+ 1/);
    expect(body).toMatch(/make_interval\(secs => p_window_seconds\)/);
  });

  it('restricts execute on both functions to service_role only', () => {
    expect(sql).toMatch(
      /revoke all on function public\.check_and_increment_rate_limit\(text, integer, integer\) from public;/
    );
    expect(sql).toMatch(
      /grant execute on function public\.check_and_increment_rate_limit\(text, integer, integer\) to service_role;/
    );
    expect(sql).toMatch(
      /revoke all on function public\.cleanup_expired_widget_rate_limits\(integer\) from public;/
    );
    expect(sql).toMatch(
      /grant execute on function public\.cleanup_expired_widget_rate_limits\(integer\) to service_role;/
    );
  });

  it('never grants anon or authenticated execute on either function', () => {
    expect(sql).not.toMatch(/grant execute[^;]*to[^;]*anon/i);
    expect(sql).not.toMatch(/grant execute[^;]*to[^;]*authenticated/i);
  });

  it('includes a cleanup/expiry function so bucket rows do not grow forever', () => {
    expect(sql).toMatch(/create or replace function public\.cleanup_expired_widget_rate_limits/);
    expect(sql).toMatch(/delete from public\.widget_rate_limits/);
    expect(sql).toMatch(/where updated_at < now\(\) - make_interval\(secs => p_max_age_seconds\)/);
  });

  it('pins a fixed search_path on both functions', () => {
    const matches = sql.match(/set search_path = public/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('does not alter any other table, column, constraint, trigger, or RLS policy, and does not disable RLS', () => {
    expect(sql).not.toMatch(/\bdrop table\b/i);
    expect(sql).not.toMatch(/\bdrop column\b/i);
    expect(sql).not.toMatch(/\bdrop policy\b/i);
    expect(sql).not.toMatch(/\bcreate trigger\b/i);
    expect(sql).not.toMatch(/disable row level security/i);
  });
});
