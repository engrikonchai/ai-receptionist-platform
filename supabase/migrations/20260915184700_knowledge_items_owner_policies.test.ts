import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A live Supabase check (`select policyname, cmd, roles from pg_policies
 * where schemaname = 'public' and tablename = 'knowledge_items';`)
 * returned zero rows, so this migration must not be assumed correct —
 * it's verified here as a static contract against the actual SQL, the
 * same approach ChatbotDemo uses for its own RLS migration
 * (ChatbotDemo's tests/rls-policies.test.ts). This can't spin up a real
 * Postgres instance with RLS in this environment; it's a regression
 * safety net, not a substitute for the manual Supabase verification
 * described in the PR/report.
 */
const sql = readFileSync(
  path.join(import.meta.dirname, '20260915184700_knowledge_items_owner_policies.sql'),
  'utf8'
);

const POLICIES: Record<'select' | 'insert' | 'update' | 'delete', string> = {
  select: 'knowledge_items_select_own',
  insert: 'knowledge_items_insert_own',
  update: 'knowledge_items_update_own',
  delete: 'knowledge_items_delete_own'
};

function statementFor(policyName: string): string {
  const marker = `create policy "${policyName}"`;
  const start = sql.indexOf(marker);
  expect(start, `expected to find ${marker}`).toBeGreaterThanOrEqual(0);
  const nextCreate = sql.indexOf('create policy', start + marker.length);
  return sql.slice(start, nextCreate === -1 ? sql.length : nextCreate);
}

describe('knowledge_items owner policies migration — static contract', () => {
  it('creates all four owner-scoped policies, each preceded by a drop', () => {
    for (const name of Object.values(POLICIES)) {
      const dropIndex = sql.indexOf(`drop policy if exists "${name}"`);
      const createIndex = sql.indexOf(`create policy "${name}"`);
      expect(dropIndex, `missing drop for ${name}`).toBeGreaterThanOrEqual(0);
      expect(createIndex, `missing create for ${name}`).toBeGreaterThanOrEqual(0);
      expect(dropIndex).toBeLessThan(createIndex);
    }
  });

  it('scopes every policy to the authenticated role only', () => {
    for (const name of Object.values(POLICIES)) {
      expect(statementFor(name)).toMatch(/to\s+authenticated/i);
    }
  });

  it('never grants the anon/public role explicit access', () => {
    expect(sql).not.toMatch(/to\s+anon/i);
    expect(sql).not.toMatch(/to\s+public\b/i);
  });

  it('never grants blanket access with using(true) or with check(true)', () => {
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(sql).not.toMatch(/with check\s*\(\s*true\s*\)/i);
  });

  it('every policy requires auth.uid() is not null', () => {
    for (const name of Object.values(POLICIES)) {
      expect(statementFor(name)).toMatch(/auth\.uid\(\)\s+is not null/i);
    }
  });

  it('every policy verifies ownership through knowledge_items.business_id -> businesses.owner_id = auth.uid()', () => {
    const ownershipJoin =
      /from public\.businesses b\s+where b\.id = knowledge_items\.business_id\s+and b\.owner_id = auth\.uid\(\)/i;
    for (const name of Object.values(POLICIES)) {
      expect(statementFor(name)).toMatch(ownershipJoin);
    }
  });

  it('the select policy has a using clause but no with check clause', () => {
    const statement = statementFor(POLICIES.select);
    expect(statement).toMatch(/using\s*\(/i);
    expect(statement).not.toMatch(/with check\s*\(/i);
  });

  it('the insert policy has a with check clause but no using clause', () => {
    const statement = statementFor(POLICIES.insert);
    expect(statement).not.toMatch(/\busing\s*\(/i);
    expect(statement).toMatch(/with check\s*\(/i);
  });

  it('the update policy has both a using clause and a with check clause', () => {
    const statement = statementFor(POLICIES.update);
    expect(statement).toMatch(/using\s*\(/i);
    expect(statement).toMatch(/with check\s*\(/i);
  });

  it('the delete policy has a using clause but no with check clause', () => {
    const statement = statementFor(POLICIES.delete);
    expect(statement).toMatch(/using\s*\(/i);
    expect(statement).not.toMatch(/with check\s*\(/i);
  });

  it('does not alter any table, column, trigger, or function', () => {
    expect(sql).not.toMatch(/\balter table\b/i);
    expect(sql).not.toMatch(/\bcreate\s+(or replace\s+)?function\b/i);
    expect(sql).not.toMatch(/\bcreate trigger\b/i);
    expect(sql).not.toMatch(/\bdrop table\b/i);
  });
});
