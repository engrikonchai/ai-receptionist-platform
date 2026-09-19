import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static contract for the single-business-per-owner migration —
 * verified against the actual SQL text, same approach as this repo's
 * other migration tests (no live Postgres instance in this
 * environment). Not a substitute for the manual Supabase verification
 * described in the PR/report.
 */
const sql = readFileSync(
  path.join(import.meta.dirname, '20260921090000_single_business_per_owner.sql'),
  'utf8'
);

// Same approach as this repo's other migration tests (e.g.
// 20260920100000_paddle_billing_foundation.test.ts): strips full `--`
// comment lines so "never mentions X" checks assert against what the
// migration actually executes, not against its own prose explaining
// what it deliberately does NOT do.
const executableSql = sql
  .split('\n')
  .filter((line) => !/^\s*--/.test(line))
  .join('\n');

describe('single-business-per-owner migration — static contract', () => {
  it('pre-checks for duplicate owner_id rows before creating the unique index', () => {
    const doBlockStart = sql.indexOf('do $$');
    const doBlockEnd = sql.indexOf('end $$;', doBlockStart);
    const preCheck = sql.slice(doBlockStart, doBlockEnd);

    expect(doBlockStart).toBeGreaterThanOrEqual(0);
    expect(preCheck).toMatch(/group by owner_id/);
    expect(preCheck).toMatch(/having count\(\*\) > 1/);
    expect(preCheck).toMatch(/raise exception/);

    // The unique index creation must come after the pre-check, not before.
    const indexIndex = sql.indexOf('create unique index if not exists businesses_owner_id_key');
    expect(indexIndex).toBeGreaterThan(doBlockEnd);
  });

  it('the exception identifies only the affected owner UUID(s) and a count, never a business id or name', () => {
    const doBlockStart = sql.indexOf('do $$');
    const doBlockEnd = sql.indexOf('end $$;', doBlockStart);
    const preCheck = sql.slice(doBlockStart, doBlockEnd);

    expect(preCheck).toMatch(/v_dupe_owner_count/);
    expect(preCheck).toMatch(/v_dupe_summary/);
    expect(preCheck).toMatch(/dupes\.owner_id/);
    // Never selects or reports a business id/name/slug alongside the count.
    expect(preCheck).not.toMatch(/\bid\b\s*,\s*count/i);
    expect(preCheck).not.toMatch(/business\.name|businesses\.name|b\.name/i);
    expect(preCheck).not.toMatch(/\bslug\b/i);
  });

  it('never deletes or merges rows anywhere in the migration', () => {
    expect(executableSql).not.toMatch(/\bdelete from\b/i);
    expect(executableSql).not.toMatch(/\bupdate public\.businesses\b/i);
    // The exception message text is allowed to describe, in prose, that
    // no merge happens ("does not delete or merge any row") — only an
    // actual `MERGE INTO` statement would be a real violation.
    expect(executableSql).not.toMatch(/\bmerge into\b/i);
  });

  it('creates the unique index guarded by if not exists, scoped to non-null owner_id, and is rerun-safe', () => {
    expect(sql).toMatch(
      /create unique index if not exists businesses_owner_id_key\s*\n\s*on public\.businesses \(owner_id\)\s*\n\s*where owner_id is not null;/
    );
  });

  it('never disables Row Level Security or touches the businesses_insert_own policy', () => {
    expect(executableSql).not.toMatch(/disable row level security/i);
    expect(executableSql).not.toMatch(/drop policy/i);
    expect(executableSql).not.toMatch(/create policy/i);
    expect(executableSql).not.toMatch(/alter policy/i);
    expect(executableSql).not.toMatch(/businesses_insert_own/);
  });

  it('does not create, drop, or alter any table, column, trigger, or function', () => {
    expect(executableSql).not.toMatch(/\bcreate table\b/i);
    expect(executableSql).not.toMatch(/\bdrop table\b/i);
    expect(executableSql).not.toMatch(/\balter table\b/i);
    expect(executableSql).not.toMatch(/\bcreate trigger\b/i);
    expect(executableSql).not.toMatch(/\bdrop trigger\b/i);
    expect(executableSql).not.toMatch(/\bcreate (or replace )?function\b/i);
    expect(executableSql).not.toMatch(/\bdrop function\b/i);
  });

  it('introduces no grant of any kind — the index alone is the only new object', () => {
    expect(executableSql).not.toMatch(/\bgrant\b/i);
    expect(executableSql).not.toMatch(/\brevoke\b/i);
  });

  it('documents that multi-business support requires an explicit future migration', () => {
    expect(sql).toMatch(/multi-business/i);
    expect(sql).toMatch(/future migration/i);
  });

  it('is idempotent: the only DDL statement is guarded by if not exists', () => {
    const ddlStatements = sql.match(/^(create|drop|alter)\s+\w+/gim) ?? [];
    for (const statement of ddlStatements) {
      expect(statement.toLowerCase()).toMatch(/^create/);
    }
    expect(sql).toMatch(/create unique index if not exists/);
  });
});
