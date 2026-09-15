import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A live Supabase audit found most tables with RLS enabled but zero
 * policies (the original ChatbotDemo migration stopped partway after a
 * duplicate-policy error). This can't spin up a real Postgres instance
 * with RLS in this environment, so — same approach as ChatbotDemo's own
 * tests/rls-policies.test.ts and this repo's
 * knowledge_items_owner_policies.test.ts — the repair migration is
 * verified here as a static contract against its actual SQL text. This
 * is a regression safety net, not a substitute for the manual Supabase
 * verification described in the PR/report.
 */
const sql = readFileSync(
  path.join(import.meta.dirname, '20260915193000_repair_live_rls_policies.sql'),
  'utf8'
);

type Shape = 'select' | 'insert' | 'update-both' | 'delete';

const EXPECTED: Record<string, Shape> = {
  profiles_select_own: 'select',
  profiles_update_own: 'update-both',
  businesses_select_own: 'select',
  businesses_insert_own: 'insert',
  businesses_update_own: 'update-both',
  businesses_delete_own: 'delete',
  conversations_select_own: 'select',
  conversations_update_own: 'update-both',
  conversations_delete_own: 'delete',
  messages_select_own: 'select',
  messages_delete_own: 'delete',
  leads_select_own: 'select',
  leads_insert_own: 'insert',
  leads_update_own: 'update-both',
  leads_delete_own: 'delete',
  handoffs_select_own: 'select',
  handoffs_update_own: 'update-both',
  handoffs_delete_own: 'delete',
  widget_settings_select_own: 'select',
  widget_settings_update_own: 'update-both'
};

const FORBIDDEN_POLICIES = [
  'profiles_insert_own',
  'profiles_delete_own',
  'conversations_insert_own',
  'handoffs_insert_own',
  'messages_insert_own',
  'messages_update_own',
  'widget_settings_insert_own',
  'widget_settings_delete_own'
];

function statementFor(policyName: string): string {
  const marker = `create policy "${policyName}"`;
  const start = sql.indexOf(marker);
  expect(start, `expected to find ${marker}`).toBeGreaterThanOrEqual(0);
  const nextCreate = sql.indexOf('create policy', start + marker.length);
  return sql.slice(start, nextCreate === -1 ? sql.length : nextCreate);
}

describe('repair-live-rls-policies migration — static contract', () => {
  it('creates every expected policy, each preceded by a drop', () => {
    for (const name of Object.keys(EXPECTED)) {
      const dropIndex = sql.indexOf(`drop policy if exists "${name}"`);
      const createIndex = sql.indexOf(`create policy "${name}"`);
      expect(dropIndex, `missing drop for ${name}`).toBeGreaterThanOrEqual(0);
      expect(createIndex, `missing create for ${name}`).toBeGreaterThanOrEqual(0);
      expect(dropIndex).toBeLessThan(createIndex);
    }
  });

  it('drops the accidental profiles_insert_own policy without recreating it', () => {
    expect(sql).toMatch(/drop policy if exists "profiles_insert_own" on public\.profiles;/);
    expect(sql).not.toMatch(/create policy "profiles_insert_own"/);
  });

  it('never creates any forbidden policy', () => {
    for (const name of FORBIDDEN_POLICIES) {
      expect(sql).not.toMatch(new RegExp(`create policy "${name}"`));
    }
  });

  it('scopes every managed policy to the authenticated role only', () => {
    for (const name of Object.keys(EXPECTED)) {
      expect(statementFor(name)).toMatch(/to\s+authenticated/i);
    }
  });

  it('never grants the anon/public role explicit access', () => {
    expect(sql).not.toMatch(/to\s+anon/i);
    expect(sql).not.toMatch(/to\s+public\b/i);
  });

  it('never grants blanket access with an unconditional true predicate', () => {
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(sql).not.toMatch(/with check\s*\(\s*true\s*\)/i);
  });

  it('every managed policy requires auth.uid() is not null', () => {
    for (const name of Object.keys(EXPECTED)) {
      expect(statementFor(name)).toMatch(/auth\.uid\(\)\s+is not null/i);
    }
  });

  it('profiles policies check id = auth.uid()', () => {
    expect(statementFor('profiles_select_own')).toMatch(/id = auth\.uid\(\)/);
    expect(statementFor('profiles_update_own')).toMatch(/id = auth\.uid\(\)/);
  });

  it('businesses policies check owner_id = auth.uid() directly (no join)', () => {
    for (const name of [
      'businesses_select_own',
      'businesses_insert_own',
      'businesses_update_own',
      'businesses_delete_own'
    ]) {
      const statement = statementFor(name);
      expect(statement).toMatch(/owner_id = auth\.uid\(\)/);
      expect(statement).not.toMatch(/exists\s*\(/);
    }
  });

  it('conversations, leads, handoffs, and widget_settings policies verify ownership through businesses.owner_id = auth.uid()', () => {
    for (const table of ['conversations', 'leads', 'handoffs', 'widget_settings']) {
      const joinPattern = new RegExp(
        `from public\\.businesses b\\s+where b\\.id = ${table}\\.business_id\\s+and b\\.owner_id = auth\\.uid\\(\\)`,
        'i'
      );
      for (const name of Object.keys(EXPECTED)) {
        if (!name.startsWith(`${table}_`)) continue;
        expect(statementFor(name)).toMatch(joinPattern);
      }
    }
  });

  it('messages select and delete policies verify ownership through conversations -> businesses', () => {
    const joinPattern =
      /from public\.conversations c\s+join public\.businesses b on b\.id = c\.business_id\s+where c\.id = messages\.conversation_id\s+and b\.owner_id = auth\.uid\(\)/i;
    expect(statementFor('messages_select_own')).toMatch(joinPattern);
    expect(statementFor('messages_delete_own')).toMatch(joinPattern);
  });

  it('applies the correct using/with-check shape per policy', () => {
    for (const [name, shape] of Object.entries(EXPECTED)) {
      const statement = statementFor(name);
      if (shape === 'select' || shape === 'delete') {
        expect(statement, name).toMatch(/using\s*\(/i);
        expect(statement, name).not.toMatch(/with check\s*\(/i);
      } else if (shape === 'insert') {
        expect(statement, name).not.toMatch(/\busing\s*\(/i);
        expect(statement, name).toMatch(/with check\s*\(/i);
      } else {
        expect(statement, name).toMatch(/using\s*\(/i);
        expect(statement, name).toMatch(/with check\s*\(/i);
      }
    }
  });

  it('does not define or touch the preserved knowledge_items policies', () => {
    for (const name of [
      'knowledge_items_select_own',
      'knowledge_items_insert_own',
      'knowledge_items_update_own',
      'knowledge_items_delete_own'
    ]) {
      expect(sql).not.toMatch(new RegExp(`create policy "${name}"`));
    }
  });

  it('does not define or touch the preserved messages_insert_owner_human_reply policy', () => {
    expect(sql).not.toMatch(/create policy "messages_insert_owner_human_reply"/);
    expect(sql).not.toMatch(/drop policy if exists "messages_insert_owner_human_reply"/);
  });

  it('does not alter any table, column, constraint, trigger, or function, and does not disable RLS', () => {
    expect(sql).not.toMatch(/\balter table\b/i);
    expect(sql).not.toMatch(/\bcreate\s+(or replace\s+)?function\b/i);
    expect(sql).not.toMatch(/\bcreate trigger\b/i);
    expect(sql).not.toMatch(/\bdrop table\b/i);
    expect(sql).not.toMatch(/\badd column\b/i);
    expect(sql).not.toMatch(/\badd constraint\b/i);
    expect(sql).not.toMatch(/disable row level security/i);
  });
});
