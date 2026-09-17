import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static contract for the Stripe billing foundation migration —
 * verified against the actual SQL text, same approach as this repo's
 * other migration tests (no live Postgres instance in this
 * environment). Not a substitute for the manual Supabase verification
 * described in the PR/report. This migration is NOT executed as part
 * of this branch.
 */
const sql = readFileSync(
  path.join(import.meta.dirname, '20260919090000_business_subscriptions.sql'),
  'utf8'
);

describe('business_subscriptions migration — static contract', () => {
  it('creates business_subscriptions as an additive, rerun-safe table', () => {
    expect(sql).toMatch(/create table if not exists public\.business_subscriptions/);
  });

  it('scopes exactly one subscription row per business via a unique, cascading FK', () => {
    const tableStart = sql.indexOf('create table if not exists public.business_subscriptions');
    const tableEnd = sql.indexOf(');', tableStart);
    const columnsSql = sql.slice(tableStart, tableEnd);

    expect(columnsSql).toMatch(
      /business_id uuid not null unique references public\.businesses\(id\) on delete cascade/
    );
  });

  it('includes every required column', () => {
    const tableStart = sql.indexOf('create table if not exists public.business_subscriptions');
    const tableEnd = sql.indexOf(');', tableStart);
    const columnsSql = sql.slice(tableStart, tableEnd);

    for (const column of [
      'id',
      'business_id',
      'stripe_customer_id',
      'stripe_subscription_id',
      'stripe_price_id',
      'status',
      'trial_start',
      'trial_end',
      'current_period_start',
      'current_period_end',
      'cancel_at_period_end',
      'canceled_at',
      'created_at',
      'updated_at'
    ]) {
      expect(columnsSql).toContain(column);
    }
  });

  it('makes stripe_customer_id and stripe_subscription_id unique so one Stripe object can never attach to two businesses', () => {
    expect(sql).toMatch(/stripe_customer_id text unique/);
    expect(sql).toMatch(/stripe_subscription_id text unique/);
  });

  it('constrains status to exactly the normalized Stripe subscription statuses', () => {
    const checkMatch = sql.match(
      /business_subscriptions_status_check check \(([\s\S]*?)\)\s*\n\);/
    );
    expect(checkMatch).not.toBeNull();
    const checkBody = checkMatch![1];

    const expectedStatuses = [
      'incomplete',
      'incomplete_expired',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'paused'
    ];
    for (const status of expectedStatuses) {
      expect(checkBody).toContain(`'${status}'`);
    }
    // Exactly these eight — nothing invented, nothing missing.
    const quoted = checkBody.match(/'[a-z_]+'/g) ?? [];
    expect(quoted).toHaveLength(expectedStatuses.length);
  });

  it('enables Row Level Security on business_subscriptions with only a SELECT policy for authenticated owners', () => {
    expect(sql).toMatch(/alter table public\.business_subscriptions enable row level security;/);
    expect(sql).toMatch(/create policy "business_subscriptions_select_own"/);
    expect(sql).toMatch(/for select/);
  });

  it('never creates an INSERT, UPDATE, or DELETE policy on business_subscriptions — every write goes through the service-role key', () => {
    const tableSection = sql.slice(
      sql.indexOf('create table if not exists public.business_subscriptions'),
      sql.indexOf('create table if not exists public.stripe_webhook_events')
    );
    expect(tableSection).not.toMatch(/for insert/i);
    expect(tableSection).not.toMatch(/for update/i);
    expect(tableSection).not.toMatch(/for delete/i);
  });

  it('grants business_subscriptions SELECT to authenticated but full access only to service_role', () => {
    expect(sql).toMatch(/grant select on public\.business_subscriptions to authenticated;/);
    expect(sql).toMatch(
      /grant select, insert, update, delete on public\.business_subscriptions to service_role;/
    );
  });

  it('scopes the owner SELECT policy through businesses.owner_id, the same join every other owner-scoped table uses', () => {
    const policyStart = sql.indexOf('create policy "business_subscriptions_select_own"');
    const policyEnd = sql.indexOf(';', policyStart);
    const policyBody = sql.slice(policyStart, policyEnd);

    expect(policyBody).toMatch(/from public\.businesses b/);
    expect(policyBody).toMatch(/b\.id = business_subscriptions\.business_id/);
    expect(policyBody).toMatch(/b\.owner_id = auth\.uid\(\)/);
  });

  it('creates stripe_webhook_events as an additive, rerun-safe idempotency table keyed by the Stripe event id', () => {
    expect(sql).toMatch(/create table if not exists public\.stripe_webhook_events/);
    expect(sql).toMatch(/stripe_event_id text primary key/);
    expect(sql).toMatch(/event_type text not null/);
    expect(sql).toMatch(/processed_at timestamptz not null/);
  });

  it('enables Row Level Security on stripe_webhook_events and creates no policy on it at all', () => {
    const tableStart = sql.indexOf('create table if not exists public.stripe_webhook_events');
    const afterTable = sql.slice(tableStart);

    expect(afterTable).toMatch(
      /alter table public\.stripe_webhook_events enable row level security;/
    );
    expect(afterTable).not.toMatch(/create policy/);
  });

  it('revokes stripe_webhook_events access from anon/authenticated/public and grants it only to service_role', () => {
    expect(sql).toMatch(
      /revoke all on public\.stripe_webhook_events from public, anon, authenticated;/
    );
    expect(sql).toMatch(
      /grant select, insert, update, delete on public\.stripe_webhook_events to service_role;/
    );
  });

  it('never stores a raw webhook payload, customer contact field, or secret on stripe_webhook_events — only safe diagnostic columns', () => {
    const tableStart = sql.indexOf('create table if not exists public.stripe_webhook_events');
    const tableEnd = sql.indexOf(');', tableStart);
    const columnsSql = sql.slice(tableStart, tableEnd);

    for (const forbidden of ['payload', 'body', 'secret', 'email', 'phone', 'address']) {
      expect(columnsSql.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('does not alter any other table, column, constraint, or trigger, and does not disable RLS', () => {
    expect(sql).not.toMatch(/\bdrop table\b/i);
    expect(sql).not.toMatch(/\bdrop column\b/i);
    expect(sql).not.toMatch(/\bcreate trigger\b/i);
    expect(sql).not.toMatch(/disable row level security/i);
    // The only "drop policy if exists" here is this migration's own
    // idempotent guard for the one policy it itself creates — never a
    // drop targeting some other, pre-existing table's policy.
    const dropPolicyMatches = sql.match(/drop policy if exists/g) ?? [];
    expect(dropPolicyMatches).toHaveLength(1);
    expect(sql).toMatch(
      /drop policy if exists "business_subscriptions_select_own" on public\.business_subscriptions;/
    );
  });
});
