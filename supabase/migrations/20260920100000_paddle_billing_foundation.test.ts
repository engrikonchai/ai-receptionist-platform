import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static contract for the Paddle billing foundation migration —
 * verified against the actual SQL text, same approach as this repo's
 * other migration tests (no live Postgres instance in this
 * environment). Not a substitute for the manual Supabase verification
 * described in the PR/report. This migration is NOT executed as part
 * of this branch.
 */
const sql = readFileSync(
  path.join(import.meta.dirname, '20260920100000_paddle_billing_foundation.sql'),
  'utf8'
);

describe('paddle billing foundation migration — static contract', () => {
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

  it('includes every required Paddle-named column', () => {
    const tableStart = sql.indexOf('create table if not exists public.business_subscriptions');
    const tableEnd = sql.indexOf(');', tableStart);
    const columnsSql = sql.slice(tableStart, tableEnd);

    for (const column of [
      'id',
      'business_id',
      'paddle_customer_id',
      'paddle_subscription_id',
      'paddle_transaction_id',
      'paddle_subscription_created_at',
      'paddle_event_occurred_at',
      'billing_generation',
      'paddle_price_id',
      'status',
      'trial_start',
      'trial_end',
      'trial_used_at',
      'current_period_start',
      'current_period_end',
      'cancel_at_period_end',
      'canceled_at',
      'created_at',
      'updated_at',
      'has_paddle_customer'
    ]) {
      expect(columnsSql).toContain(column);
    }
  });

  it('never references Stripe anywhere in the migration', () => {
    expect(sql.toLowerCase()).not.toMatch(/stripe/);
  });

  it('derives has_paddle_customer as a stored generated column instead of exposing the raw id', () => {
    expect(sql).toMatch(
      /has_paddle_customer boolean generated always as \(paddle_customer_id is not null\) stored/
    );
  });

  it('makes paddle_customer_id and paddle_subscription_id unique so one Paddle object can never attach to two businesses', () => {
    expect(sql).toMatch(/paddle_customer_id text unique/);
    expect(sql).toMatch(/paddle_subscription_id text unique/);
  });

  it("constrains status to exactly Paddle's own normalized subscription statuses", () => {
    const checkMatch = sql.match(/business_subscriptions_status_check check \(([\s\S]*?)\)/);
    expect(checkMatch).not.toBeNull();
    const checkBody = checkMatch![1];

    const expectedStatuses = ['trialing', 'active', 'past_due', 'paused', 'canceled'];
    for (const status of expectedStatuses) {
      expect(checkBody).toContain(`'${status}'`);
    }
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
      sql.indexOf('create or replace function public.sync_business_subscription')
    );
    expect(tableSection).not.toMatch(/for insert/i);
    expect(tableSection).not.toMatch(/for update/i);
    expect(tableSection).not.toMatch(/for delete/i);
  });

  it('grants service_role full access to business_subscriptions', () => {
    expect(sql).toMatch(
      /grant select, insert, update, delete on public\.business_subscriptions to service_role;/
    );
  });

  it('revokes ALL of public, anon, AND authenticated from business_subscriptions before granting the narrow column-level SELECT', () => {
    expect(sql).toMatch(
      /revoke all on public\.business_subscriptions from public, anon, authenticated;/
    );
    const revokeIndex = sql.indexOf(
      'revoke all on public.business_subscriptions from public, anon, authenticated;'
    );
    const grantIndex = sql.indexOf(
      'grant select (',
      sql.indexOf('create table if not exists public.business_subscriptions')
    );
    expect(grantIndex).toBeGreaterThan(revokeIndex);
  });

  it('grants authenticated only a column-level SELECT that excludes every secret Paddle identifier and ordering-only column', () => {
    const grantMatch = sql.match(
      /grant select \(([\s\S]*?)\) on public\.business_subscriptions to authenticated;/
    );
    expect(grantMatch).not.toBeNull();
    const grantedColumns = grantMatch![1];

    for (const secret of [
      'paddle_customer_id',
      'paddle_subscription_id',
      'paddle_transaction_id',
      'paddle_subscription_created_at',
      'paddle_event_occurred_at',
      'billing_generation'
    ]) {
      expect(grantedColumns).not.toMatch(new RegExp(`\\b${secret}\\b`));
    }

    for (const column of [
      'status',
      'trial_start',
      'trial_end',
      'trial_used_at',
      'current_period_start',
      'current_period_end',
      'cancel_at_period_end',
      'canceled_at',
      'has_paddle_customer'
    ]) {
      expect(grantedColumns).toContain(column);
    }
  });

  it('never grants a table-wide (unqualified) SELECT on business_subscriptions to authenticated', () => {
    expect(sql).not.toMatch(/grant select on public\.business_subscriptions to authenticated;/);
  });

  it('scopes the owner SELECT policy through businesses.owner_id, the same join every other owner-scoped table uses', () => {
    const policyStart = sql.indexOf('create policy "business_subscriptions_select_own"');
    const policyEnd = sql.indexOf(';', policyStart);
    const policyBody = sql.slice(policyStart, policyEnd);

    expect(policyBody).toMatch(/from public\.businesses b/);
    expect(policyBody).toMatch(/b\.id = business_subscriptions\.business_id/);
    expect(policyBody).toMatch(/b\.owner_id = auth\.uid\(\)/);
  });

  it('defines sync_business_subscription with independent trial recording and a deterministic, multi-layered ordering guard', () => {
    const fnMatch = sql.match(
      /create or replace function public\.sync_business_subscription\(([\s\S]*?)\)\s*\nreturns void/
    );
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![1]).toContain('p_billing_generation bigint');
    expect(fnMatch![1]).toContain('p_paddle_event_occurred_at timestamptz');

    const fnBody = sql.slice(
      sql.indexOf('create or replace function public.sync_business_subscription'),
      sql.indexOf('revoke all on function public.sync_business_subscription')
    );

    // A real upsert, not a separate select-then-write.
    expect(fnBody).toMatch(/on conflict \(business_id\) do update set/);
    expect(fnBody).not.toMatch(/\bselect\b[\s\S]*\binto\b/i);

    // Statement 1: unconditional trial-usage recording, before the guarded upsert.
    const trialStatementMatch = fnBody.match(
      /update public\.business_subscriptions\s*\n\s*set trial_used_at = now\(\), updated_at = now\(\)\s*\n\s*where business_id = p_business_id\s*\n\s*and trial_used_at is null\s*\n\s*and p_trial_start is not null;/
    );
    expect(trialStatementMatch).not.toBeNull();
    const insertIndex = fnBody.indexOf('insert into public.business_subscriptions');
    expect(trialStatementMatch!.index).toBeLessThan(insertIndex);

    // Same-subscription in-place updates are additionally guarded by
    // the event's own occurred_at, protecting against Paddle's
    // unordered webhook delivery for the SAME subscription.
    expect(fnBody).toMatch(
      /business_subscriptions\.paddle_subscription_id = excluded\.paddle_subscription_id\s*\n\s*and \(\s*\n\s*business_subscriptions\.paddle_event_occurred_at is null\s*\n\s*or excluded\.paddle_event_occurred_at is null\s*\n\s*or excluded\.paddle_event_occurred_at >= business_subscriptions\.paddle_event_occurred_at/
    );

    // Primary cross-subscription ordering key: a strictly-greater
    // billing_generation wins — never a lexical comparison of Paddle ids.
    expect(fnBody).toMatch(
      /excluded\.billing_generation > business_subscriptions\.billing_generation/
    );
    expect(fnBody).not.toMatch(/paddle_subscription_id\s*[<>]/);

    // Timestamp comparison survives only as an explicitly gated
    // fallback for rows with no generation on either side.
    const timestampFallback = fnBody.match(
      /excluded\.billing_generation is null\s*\n\s*and business_subscriptions\.billing_generation is null\s*\n\s*and \(([\s\S]*?)\)\s*\n\s*\);/
    );
    expect(timestampFallback).not.toBeNull();
    expect(timestampFallback![1]).toMatch(
      /excluded\.paddle_subscription_created_at >= business_subscriptions\.paddle_subscription_created_at/
    );

    // trial_used_at is coalesced (immutable-once-set) in the guarded statement too.
    expect(fnBody).toMatch(
      /trial_used_at = coalesce\(business_subscriptions\.trial_used_at, excluded\.trial_used_at\)/
    );
  });

  it('grants execute on sync_business_subscription only to service_role', () => {
    const grantSection = sql.slice(
      sql.indexOf('revoke all on function public.sync_business_subscription'),
      sql.indexOf('create table if not exists public.billing_checkout_attempts')
    );
    expect(grantSection).toMatch(/revoke all on function public\.sync_business_subscription/);
    expect(grantSection).toMatch(/from public, anon, authenticated;/);
    expect(grantSection).toMatch(/grant execute on function public\.sync_business_subscription/);
    expect(grantSection).toMatch(/to service_role;/);
  });

  it('creates billing_checkout_attempts with an atomic one-pending-per-business constraint and a monotonic generation column', () => {
    expect(sql).toMatch(/create table if not exists public\.billing_checkout_attempts/);
    expect(sql).toMatch(
      /create unique index if not exists billing_checkout_attempts_one_pending_per_business\s*\n\s*on public\.billing_checkout_attempts \(business_id\)\s*\n\s*where \(status = 'pending'\);/
    );

    const tableStart = sql.indexOf('create table if not exists public.billing_checkout_attempts');
    const tableEnd = sql.indexOf(');', tableStart);
    const columnsSql = sql.slice(tableStart, tableEnd);
    expect(columnsSql).toMatch(/generation bigint generated always as identity/);
    expect(columnsSql).toContain('paddle_transaction_id');
    expect(columnsSql).not.toContain('stripe_checkout_session_id');
  });

  it('enables RLS on billing_checkout_attempts and grants it only to service_role, with zero policies', () => {
    const tableStart = sql.indexOf('create table if not exists public.billing_checkout_attempts');
    const tableEnd = sql.indexOf('create table if not exists public.paddle_webhook_events');
    const section = sql.slice(tableStart, tableEnd);

    expect(section).toMatch(
      /alter table public\.billing_checkout_attempts enable row level security;/
    );
    expect(section).toMatch(
      /revoke all on public\.billing_checkout_attempts from public, anon, authenticated;/
    );
    expect(section).toMatch(
      /grant select, insert, update, delete on public\.billing_checkout_attempts to service_role;/
    );
    expect(section).not.toMatch(/create policy/);
  });

  it('creates paddle_webhook_events as an additive, rerun-safe idempotency table keyed by the Paddle event id', () => {
    expect(sql).toMatch(/create table if not exists public\.paddle_webhook_events/);
    expect(sql).toMatch(/paddle_event_id text primary key/);
    expect(sql).toMatch(/event_type text not null/);
    expect(sql).toMatch(/processed_at timestamptz not null/);
  });

  it('enables Row Level Security on paddle_webhook_events and creates no policy on it at all', () => {
    const tableStart = sql.indexOf('create table if not exists public.paddle_webhook_events');
    const afterTable = sql.slice(tableStart);

    expect(afterTable).toMatch(
      /alter table public\.paddle_webhook_events enable row level security;/
    );
    expect(afterTable).not.toMatch(/create policy/);
  });

  it('revokes paddle_webhook_events access from anon/authenticated/public and grants it only to service_role', () => {
    expect(sql).toMatch(
      /revoke all on public\.paddle_webhook_events from public, anon, authenticated;/
    );
    expect(sql).toMatch(
      /grant select, insert, update, delete on public\.paddle_webhook_events to service_role;/
    );
  });

  it('never stores a raw webhook payload, customer contact field, or secret on paddle_webhook_events — only safe diagnostic columns', () => {
    const tableStart = sql.indexOf('create table if not exists public.paddle_webhook_events');
    const tableEnd = sql.indexOf(');', tableStart);
    const columnsSql = sql.slice(tableStart, tableEnd);

    for (const forbidden of ['payload', 'body', 'secret', 'email', 'phone', 'address']) {
      expect(columnsSql.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('does not alter any other table, does not drop a column, and does not disable RLS', () => {
    expect(sql).not.toMatch(/\bdrop table\b/i);
    expect(sql).not.toMatch(/\bdrop column\b/i);
    expect(sql).not.toMatch(/disable row level security/i);
    const dropPolicyMatches = sql.match(/drop policy if exists/g) ?? [];
    expect(dropPolicyMatches).toHaveLength(1);
    expect(sql).toMatch(
      /drop policy if exists "business_subscriptions_select_own" on public\.business_subscriptions;/
    );
  });
});
