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

  it('includes every required column, including the v1.1/v1.2 ordering/trial/derived columns', () => {
    const tableStart = sql.indexOf('create table if not exists public.business_subscriptions');
    const tableEnd = sql.indexOf(');', tableStart);
    const columnsSql = sql.slice(tableStart, tableEnd);

    for (const column of [
      'id',
      'business_id',
      'stripe_customer_id',
      'stripe_subscription_id',
      'stripe_subscription_created_at',
      'billing_generation',
      'stripe_price_id',
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
      'has_stripe_customer'
    ]) {
      expect(columnsSql).toContain(column);
    }
  });

  it('derives has_stripe_customer as a stored generated column instead of exposing the raw id', () => {
    expect(sql).toMatch(
      /has_stripe_customer boolean generated always as \(stripe_customer_id is not null\) stored/
    );
  });

  it('adds every v1.1/v1.2 column idempotently, including the generated has_stripe_customer, for anyone who already ran an earlier shape of this table', () => {
    expect(sql).toMatch(
      /alter table public\.business_subscriptions\s+add column if not exists stripe_subscription_created_at timestamptz;/
    );
    expect(sql).toMatch(
      /alter table public\.business_subscriptions\s+add column if not exists billing_generation bigint;/
    );
    expect(sql).toMatch(
      /alter table public\.business_subscriptions\s+add column if not exists trial_used_at timestamptz;/
    );
    expect(sql).toMatch(
      /alter table public\.business_subscriptions\s+add column if not exists has_stripe_customer boolean generated always as \(stripe_customer_id is not null\) stored;/
    );
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

  it('grants authenticated only a column-level SELECT that excludes the Stripe identifiers', () => {
    const grantMatch = sql.match(
      /grant select \(([\s\S]*?)\) on public\.business_subscriptions to authenticated;/
    );
    expect(grantMatch).not.toBeNull();
    const grantedColumns = grantMatch![1];

    // Never these four — the actual fix for the column-exposure bug.
    expect(grantedColumns).not.toMatch(/\bstripe_customer_id\b/);
    expect(grantedColumns).not.toMatch(/\bstripe_subscription_id\b/);
    expect(grantedColumns).not.toMatch(/\bstripe_subscription_created_at\b/);
    expect(grantedColumns).not.toMatch(/\bbilling_generation\b/);

    // But still enough to render the billing page.
    for (const column of [
      'status',
      'trial_start',
      'trial_end',
      'trial_used_at',
      'current_period_start',
      'current_period_end',
      'cancel_at_period_end',
      'canceled_at',
      'has_stripe_customer'
    ]) {
      expect(grantedColumns).toContain(column);
    }
  });

  it('never grants a table-wide (unqualified) SELECT on business_subscriptions to authenticated', () => {
    expect(sql).not.toMatch(/grant select on public\.business_subscriptions to authenticated;/);
  });

  it('revokes ALL of public, anon, AND authenticated from business_subscriptions before granting the narrow column-level SELECT — v1.2 fix', () => {
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
    expect(revokeIndex).toBeGreaterThan(-1);
    expect(grantIndex).toBeGreaterThan(revokeIndex);
  });

  it('scopes the owner SELECT policy through businesses.owner_id, the same join every other owner-scoped table uses', () => {
    const policyStart = sql.indexOf('create policy "business_subscriptions_select_own"');
    const policyEnd = sql.indexOf(';', policyStart);
    const policyBody = sql.slice(policyStart, policyEnd);

    expect(policyBody).toMatch(/from public\.businesses b/);
    expect(policyBody).toMatch(/b\.id = business_subscriptions\.business_id/);
    expect(policyBody).toMatch(/b\.owner_id = auth\.uid\(\)/);
  });

  it('defines sync_business_subscription with a deterministic, generation-based ordering guard (v1.2) and a second-precision fallback only when neither side has a generation', () => {
    const fnMatch = sql.match(
      /create or replace function public\.sync_business_subscription\(([\s\S]*?)\)\s*\nreturns void/
    );
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![1]).toContain('p_billing_generation bigint');

    const fnBody = sql.slice(
      sql.indexOf('create or replace function public.sync_business_subscription'),
      sql.indexOf('revoke all on function public.sync_business_subscription')
    );

    // A real upsert, not a separate select-then-write.
    expect(fnBody).toMatch(/on conflict \(business_id\) do update set/);
    expect(fnBody).not.toMatch(/\bselect\b[\s\S]*\binto\b/i);

    // Same-subscription in-place updates always apply.
    expect(fnBody).toMatch(
      /business_subscriptions\.stripe_subscription_id = excluded\.stripe_subscription_id/
    );

    // Primary ordering key: a strictly-greater billing_generation wins —
    // never a lexical comparison of Stripe ids.
    expect(fnBody).toMatch(
      /excluded\.billing_generation > business_subscriptions\.billing_generation/
    );
    expect(fnBody).not.toMatch(/stripe_subscription_id\s*[<>]/);

    // The Stripe-timestamp comparison survives only as an explicitly
    // gated fallback for rows with no generation on either side.
    const timestampFallback = fnBody.match(
      /excluded\.billing_generation is null\s*\n\s*and business_subscriptions\.billing_generation is null\s*\n\s*and \(([\s\S]*?)\)\s*\n\s*\);/
    );
    expect(timestampFallback).not.toBeNull();
    expect(timestampFallback![1]).toMatch(
      /excluded\.stripe_subscription_created_at >= business_subscriptions\.stripe_subscription_created_at/
    );

    // billing_generation itself is copied through on every write.
    expect(fnBody).toMatch(/billing_generation = excluded\.billing_generation/);
  });

  it('records trial usage in its own unconditional statement, independent of the subscription-ordering guard (v1.2 fix)', () => {
    const fnBody = sql.slice(
      sql.indexOf('create or replace function public.sync_business_subscription'),
      sql.indexOf('revoke all on function public.sync_business_subscription')
    );

    // Statement 1: an unconditional update, gated only by "not already
    // set" and "this call actually represents a real trial" — no
    // ordering/generation condition at all, so a stale/rejected
    // subscription event still permanently records trial usage.
    const trialStatementMatch = fnBody.match(
      /update public\.business_subscriptions\s*\n\s*set trial_used_at = now\(\), updated_at = now\(\)\s*\n\s*where business_id = p_business_id\s*\n\s*and trial_used_at is null\s*\n\s*and p_trial_start is not null;/
    );
    expect(trialStatementMatch).not.toBeNull();

    // It comes before the guarded insert/upsert (statement 2), and
    // contains no ordering/generation condition of its own.
    const insertIndex = fnBody.indexOf('insert into public.business_subscriptions');
    expect(trialStatementMatch!.index).toBeLessThan(insertIndex);
    expect(trialStatementMatch![0]).not.toMatch(/billing_generation/);
    expect(trialStatementMatch![0]).not.toMatch(/stripe_subscription_created_at/);

    // trial_used_at can only ever move from null to non-null — the
    // guarded upsert's own coalesce (statement 2) is the second,
    // consistent half of that same immutability guarantee.
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

  it('creates billing_checkout_attempts with an atomic one-pending-per-business constraint', () => {
    expect(sql).toMatch(/create table if not exists public\.billing_checkout_attempts/);
    expect(sql).toMatch(
      /create unique index if not exists billing_checkout_attempts_one_pending_per_business\s*\n\s*on public\.billing_checkout_attempts \(business_id\)\s*\n\s*where \(status = 'pending'\);/
    );
  });

  it('gives billing_checkout_attempts a strictly monotonic generation identity column (v1.2, item 4) — added idempotently too', () => {
    const tableStart = sql.indexOf('create table if not exists public.billing_checkout_attempts');
    const tableEnd = sql.indexOf(');', tableStart);
    const columnsSql = sql.slice(tableStart, tableEnd);

    expect(columnsSql).toMatch(/generation bigint generated always as identity/);
    expect(sql).toMatch(
      /alter table public\.billing_checkout_attempts\s+add column if not exists generation bigint generated always as identity;/
    );
  });

  it("gives billing_checkout_attempts a 31-minute default expires_at — one minute above Stripe Checkout Session's own 30-minute minimum (v1.2, item 1)", () => {
    expect(sql).toMatch(
      /expires_at timestamptz not null default \(now\(\) \+ interval '31 minutes'\)/
    );
  });

  it('enables RLS on billing_checkout_attempts and grants it only to service_role, with zero policies', () => {
    const tableStart = sql.indexOf('create table if not exists public.billing_checkout_attempts');
    const tableEnd = sql.indexOf('create table if not exists public.stripe_webhook_events');
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

  it('does not alter any other table, does not drop a column, and does not disable RLS', () => {
    expect(sql).not.toMatch(/\bdrop table\b/i);
    expect(sql).not.toMatch(/\bdrop column\b/i);
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
