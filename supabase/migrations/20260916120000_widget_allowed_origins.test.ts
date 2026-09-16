import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static contract for the widget allowed-origins migration — verified
 * against the actual SQL text, same approach as this repo's other
 * migration tests (no live Postgres instance in this environment). Not
 * a substitute for the manual Supabase verification described in the
 * PR/report.
 */
const sql = readFileSync(
  path.join(import.meta.dirname, '20260916120000_widget_allowed_origins.sql'),
  'utf8'
);

describe('widget allowed-origins migration — static contract', () => {
  it('adds allowed_origins as an additive, safe-by-default column', () => {
    expect(sql).toMatch(
      /alter table public\.widget_settings\s+add column if not exists allowed_origins text\[\] not null default '\{\}';/
    );
  });

  it('never defaults allowed_origins to "allow everything" (e.g. a wildcard)', () => {
    expect(sql).not.toMatch(/default\s+'\{\*\}'/);
    expect(sql).not.toMatch(/default\s+array\['\*'\]/i);
  });

  it('creates widget_public_config as a rerun-safe (create or replace) view', () => {
    expect(sql).toMatch(/create or replace view public\.widget_public_config as/);
  });

  it('the view never selects business_id, owner_id, handoff_email, or any leads/handoffs/messages/notes column', () => {
    // Only the select list (between `select` and `from`) — business_id
    // legitimately appears in the join condition below it (`ws.business_id
    // = b.id`), which links the two tables but is never an output column
    // a caller can read.
    const viewStart = sql.indexOf('create or replace view public.widget_public_config');
    const selectStart = sql.indexOf('select', viewStart);
    const fromStart = sql.indexOf('from public.businesses', selectStart);
    const selectListSql = sql.slice(selectStart, fromStart);

    expect(selectListSql).not.toMatch(/\bbusiness_id\b/);
    expect(selectListSql).not.toMatch(/\bowner_id\b/);
    expect(selectListSql).not.toMatch(/\bhandoff_email\b/);
    expect(selectListSql).not.toMatch(/\bleads\b/);
    expect(selectListSql).not.toMatch(/\bhandoffs\b/);
    expect(selectListSql).not.toMatch(/\bmessages\b/);
    expect(selectListSql).not.toMatch(/\bconversations\b/);
  });

  it('the view only selects the intended safe columns', () => {
    const viewStart = sql.indexOf('create or replace view public.widget_public_config');
    const viewEnd = sql.indexOf(';', viewStart);
    const viewSql = sql.slice(viewStart, viewEnd);

    for (const column of [
      'b.public_widget_id',
      'b.is_active as business_active',
      'b.supported_languages',
      'b.default_language',
      'ws.title',
      'ws.welcome_message_en',
      'ws.welcome_message_me',
      'ws.welcome_message_ru',
      'ws.primary_color',
      'ws.position',
      'ws.mock_ai_enabled as widget_enabled',
      'ws.human_handoff_enabled',
      'ws.allowed_origins'
    ]) {
      expect(viewSql).toContain(column);
    }
  });

  it('grants select on the view to anon and authenticated only — never insert/update/delete', () => {
    expect(sql).toMatch(/grant select on public\.widget_public_config to anon, authenticated;/);
    expect(sql).not.toMatch(
      /grant\s+(insert|update|delete|all)\s+on public\.widget_public_config/i
    );
  });

  it('never grants anon/authenticated anything directly on the underlying tables', () => {
    expect(sql).not.toMatch(/grant\s+\w+\s+on public\.businesses/i);
    expect(sql).not.toMatch(/grant\s+\w+\s+on public\.widget_settings/i);
  });

  it('never sets security_invoker on the view (which would break anon access entirely)', () => {
    expect(sql).not.toMatch(/security_invoker/i);
  });

  it('does not alter any other table, column, constraint, trigger, function, or RLS policy, and does not disable RLS', () => {
    expect(sql).not.toMatch(/\bdrop table\b/i);
    expect(sql).not.toMatch(/\bdrop column\b/i);
    expect(sql).not.toMatch(/\bcreate policy\b/i);
    expect(sql).not.toMatch(/\bdrop policy\b/i);
    expect(sql).not.toMatch(/\bcreate\s+(or replace\s+)?function\b/i);
    expect(sql).not.toMatch(/\bcreate trigger\b/i);
    expect(sql).not.toMatch(/disable row level security/i);
  });
});
