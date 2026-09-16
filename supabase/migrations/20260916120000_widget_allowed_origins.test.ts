import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static contract for the widget allowed-origins/widget_enabled/
 * resolve_widget_config migration — verified against the actual SQL
 * text, same approach as this repo's other migration tests (no live
 * Postgres instance in this environment). Not a substitute for the
 * manual Supabase verification described in the PR/report.
 */
const sql = readFileSync(
  path.join(import.meta.dirname, '20260916120000_widget_allowed_origins.sql'),
  'utf8'
);

describe('widget allowed-origins migration — static contract', () => {
  it('adds widget_enabled as an additive column, separate from mock_ai_enabled, defaulting to true', () => {
    expect(sql).toMatch(
      /alter table public\.widget_settings\s+add column if not exists widget_enabled boolean not null default true;/
    );
  });

  it('adds allowed_origins as an additive, safe-by-default column', () => {
    expect(sql).toMatch(
      /alter table public\.widget_settings\s+add column if not exists allowed_origins text\[\] not null default '\{\}';/
    );
  });

  it('never defaults allowed_origins to "allow everything" (e.g. a wildcard)', () => {
    expect(sql).not.toMatch(/default\s+'\{\*\}'/);
    expect(sql).not.toMatch(/default\s+array\['\*'\]/i);
  });

  it('drops the earlier, anon-enumerable view design instead of granting anon a table/view', () => {
    expect(sql).toMatch(/drop view if exists public\.widget_public_config;/);
    expect(sql).not.toMatch(/create (or replace )?view public\.widget_public_config/i);
  });

  it('creates resolve_widget_config as a rerun-safe (create or replace) SECURITY DEFINER function', () => {
    expect(sql).toMatch(/create or replace function public\.resolve_widget_config\(/);
    expect(sql).toMatch(/security definer/i);
  });

  it('pins a fixed search_path on the function, so a hijacked caller search_path cannot redirect its table references', () => {
    expect(sql).toMatch(/set search_path = public/i);
  });

  it('requires both a widget id and an origin argument — no zero-argument "list everything" call exists', () => {
    const fnStart = sql.indexOf('create or replace function public.resolve_widget_config');
    const paramsEnd = sql.indexOf(')', fnStart);
    const params = sql.slice(fnStart, paramsEnd);

    expect(params).toMatch(/p_widget_id\s+uuid/);
    expect(params).toMatch(/p_origin\s+text/);
  });

  it('the function only returns the intended safe display columns', () => {
    const fnStart = sql.indexOf('create or replace function public.resolve_widget_config');
    const returnsStart = sql.indexOf('returns table', fnStart);
    const returnsEnd = sql.indexOf(')', returnsStart);
    const returnsSql = sql.slice(returnsStart, returnsEnd);

    for (const column of [
      'title',
      'welcome_message_en',
      'welcome_message_me',
      'welcome_message_ru',
      'primary_color',
      'human_handoff_enabled',
      'default_language',
      'supported_languages'
    ]) {
      expect(returnsSql).toContain(column);
    }
  });

  it('never returns business_id, owner_id, allowed_origins, or handoff_email from the function', () => {
    const fnStart = sql.indexOf('create or replace function public.resolve_widget_config');
    const bodyStart = sql.indexOf('as $$', fnStart);
    const bodyEnd = sql.indexOf('$$;', bodyStart);
    const selectListSql = sql.slice(bodyStart, sql.indexOf('from public.businesses', bodyStart));
    const wholeBody = sql.slice(bodyStart, bodyEnd);

    expect(selectListSql).not.toMatch(/\bbusiness_id\b/);
    expect(selectListSql).not.toMatch(/\bowner_id\b/);
    expect(selectListSql).not.toMatch(/\ballowed_origins\b/);
    expect(selectListSql).not.toMatch(/\bhandoff_email\b/);
    // allowed_origins is legitimately referenced in the WHERE clause
    // (to filter by it), just never in the returned column list above.
    expect(wholeBody).toMatch(/allowed_origins/);
  });

  it('the function requires the widget id, an active business, an enabled widget, and an exact origin match', () => {
    const fnStart = sql.indexOf('create or replace function public.resolve_widget_config');
    const bodyStart = sql.indexOf('as $$', fnStart);
    const bodyEnd = sql.indexOf('$$;', bodyStart);
    const body = sql.slice(bodyStart, bodyEnd);

    expect(body).toMatch(/b\.public_widget_id\s*=\s*p_widget_id/);
    expect(body).toMatch(/b\.is_active\s*=\s*true/);
    expect(body).toMatch(/ws\.widget_enabled\s*=\s*true/);
    expect(body).toMatch(/p_origin\s*=\s*any\s*\(\s*ws\.allowed_origins\s*\)/);
  });

  it('revokes default PUBLIC execute and grants execute only to anon and authenticated', () => {
    expect(sql).toMatch(
      /revoke all on function public\.resolve_widget_config\(uuid, text\) from public;/
    );
    expect(sql).toMatch(
      /grant execute on function public\.resolve_widget_config\(uuid, text\) to anon, authenticated;/
    );
  });

  it('never grants anon/authenticated anything directly on the underlying tables', () => {
    expect(sql).not.toMatch(/grant\s+\w+\s+on public\.businesses/i);
    expect(sql).not.toMatch(/grant\s+\w+\s+on public\.widget_settings/i);
  });

  it('does not alter any other table, column, constraint, trigger, or RLS policy, and does not disable RLS', () => {
    expect(sql).not.toMatch(/\bdrop table\b/i);
    expect(sql).not.toMatch(/\bdrop column\b/i);
    expect(sql).not.toMatch(/\bcreate policy\b/i);
    expect(sql).not.toMatch(/\bdrop policy\b/i);
    expect(sql).not.toMatch(/\bcreate trigger\b/i);
    expect(sql).not.toMatch(/disable row level security/i);
  });
});
