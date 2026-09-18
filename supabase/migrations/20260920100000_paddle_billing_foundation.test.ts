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

  it('never references Stripe in executable SQL — only in `--` comments explaining the legacy state this migration must not touch', () => {
    const executableSql = sql
      .split('\n')
      .filter((line) => !/^\s*--/.test(line))
      .join('\n');

    expect(executableSql.toLowerCase()).not.toMatch(/stripe/);
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

/**
 * Regression coverage for the exact production failure this migration
 * was corrected for:
 *
 *   ERROR 42703: column "paddle_price_id" of relation
 *   "business_subscriptions" does not exist
 *
 * Root cause: `create table if not exists` is a silent no-op against a
 * pre-existing table (the older Stripe-era business_subscriptions —
 * see supabase/migrations/20260919090000_business_subscriptions.sql,
 * which a manual/partial run may already have executed against the
 * database this migration now targets), so every column the CREATE
 * TABLE declares inline is NOT guaranteed to actually exist. Every test
 * below is a purely static/structural check of the SQL text (this repo
 * has no live Postgres instance to run these DDL statements against —
 * see this file's own top-of-file doc comment), but each one would
 * fail if the specific explicit-upgrade statement it checks for were
 * ever removed or reordered incorrectly, which is exactly the class of
 * regression that produced the original failure.
 */
describe('paddle billing foundation migration — existing-table upgrade / partial-run recovery', () => {
  const businessSubscriptionsColumns = [
    'paddle_customer_id',
    'paddle_subscription_id',
    'paddle_transaction_id',
    'paddle_subscription_created_at',
    'paddle_event_occurred_at',
    'billing_generation',
    'paddle_price_id',
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
  ];

  it('adds every Paddle/new business_subscriptions column via an explicit ADD COLUMN IF NOT EXISTS, for existing-table upgrade', () => {
    for (const column of businessSubscriptionsColumns) {
      const addColumnRegex = new RegExp(
        `alter table public\\.business_subscriptions\\s*\\n\\s*add column if not exists ${column}\\b`
      );
      expect(sql).toMatch(addColumnRegex);
    }
  });

  it('would have caught the exact paddle_price_id failure: every column referenced in the authenticated GRANT has its own explicit ADD COLUMN IF NOT EXISTS', () => {
    const grantMatch = sql.match(
      /grant select \(([\s\S]*?)\) on public\.business_subscriptions to authenticated;/
    );
    expect(grantMatch).not.toBeNull();
    const grantedColumns = grantMatch![1]
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    // id/business_id/status are guaranteed by every known CREATE TABLE
    // shape this table has ever had (legacy Stripe-era included) —
    // status is converged via the explicit backfill-then-constrain
    // block instead of ADD COLUMN (see the "does not add status... as
    // new columns" test below). Every OTHER granted column,
    // paddle_price_id included, must have its own explicit ADD COLUMN
    // upgrade path or this test fails exactly the way the real
    // migration run did.
    const guaranteedByAnySchema = new Set(['id', 'business_id', 'status']);

    for (const column of grantedColumns) {
      if (guaranteedByAnySchema.has(column)) continue;
      const addColumnRegex = new RegExp(
        `alter table public\\.business_subscriptions\\s*\\n\\s*add column if not exists ${column}\\b`
      );
      expect(sql).toMatch(addColumnRegex);
    }
  });

  it('adds every business_subscriptions column before the authenticated GRANT, the status CHECK constraint, and the uniqueness indexes ever reference it', () => {
    const grantIndex = sql.indexOf(
      'grant select (',
      sql.indexOf('create table if not exists public.business_subscriptions')
    );
    expect(grantIndex).toBeGreaterThan(-1);

    for (const column of businessSubscriptionsColumns) {
      const addColumnIndex = sql.indexOf(`add column if not exists ${column}`);
      expect(addColumnIndex).toBeGreaterThan(-1);
      expect(addColumnIndex).toBeLessThan(grantIndex);
    }
  });

  it('adds has_paddle_customer only after paddle_customer_id, the column its generated expression depends on', () => {
    const customerIdIndex = sql.indexOf('add column if not exists paddle_customer_id text');
    const hasCustomerIndex = sql.indexOf('add column if not exists has_paddle_customer boolean');
    expect(customerIdIndex).toBeGreaterThan(-1);
    expect(hasCustomerIndex).toBeGreaterThan(customerIdIndex);
  });

  it('does not add status as a new column — every known prior schema already has it, NOT NULL, from its own original CREATE TABLE', () => {
    expect(sql).not.toMatch(/add column if not exists status\b/);
  });

  it('adds cancel_at_period_end/created_at/updated_at bare/nullable (never inline NOT NULL DEFAULT) and converges their default/NOT NULL separately', () => {
    for (const column of ['cancel_at_period_end', 'created_at', 'updated_at']) {
      expect(sql).toMatch(new RegExp(`add column if not exists ${column}\\b`));
      expect(sql).not.toMatch(new RegExp(`add column if not exists ${column}\\b[^;]*not null`));
    }
  });

  it('converges status/cancel_at_period_end/created_at/updated_at via an explicit backfill-then-constrain sequence, never a bare SET NOT NULL', () => {
    const convergence: Array<{
      column: string;
      backfill: RegExp;
      default: RegExp;
      notNull: RegExp;
    }> = [
      {
        column: 'status',
        backfill:
          /update public\.business_subscriptions set status = 'trialing' where status is null;/,
        default:
          /alter table public\.business_subscriptions alter column status set default 'trialing';/,
        notNull: /alter table public\.business_subscriptions alter column status set not null;/
      },
      {
        column: 'cancel_at_period_end',
        backfill:
          /update public\.business_subscriptions set cancel_at_period_end = false where cancel_at_period_end is null;/,
        default:
          /alter table public\.business_subscriptions alter column cancel_at_period_end set default false;/,
        notNull:
          /alter table public\.business_subscriptions alter column cancel_at_period_end set not null;/
      },
      {
        column: 'created_at',
        backfill:
          /update public\.business_subscriptions set created_at = now\(\) where created_at is null;/,
        default:
          /alter table public\.business_subscriptions alter column created_at set default now\(\);/,
        notNull: /alter table public\.business_subscriptions alter column created_at set not null;/
      },
      {
        column: 'updated_at',
        backfill:
          /update public\.business_subscriptions set updated_at = now\(\) where updated_at is null;/,
        default:
          /alter table public\.business_subscriptions alter column updated_at set default now\(\);/,
        notNull: /alter table public\.business_subscriptions alter column updated_at set not null;/
      }
    ];

    for (const { column, backfill, default: defaultRegex, notNull } of convergence) {
      const backfillMatch = sql.match(backfill);
      const defaultMatch = sql.match(defaultRegex);
      const notNullMatch = sql.match(notNull);
      expect(backfillMatch, `missing backfill for ${column}`).not.toBeNull();
      expect(defaultMatch, `missing default for ${column}`).not.toBeNull();
      expect(notNullMatch, `missing not-null for ${column}`).not.toBeNull();

      // Backfill (UPDATE ... WHERE col IS NULL) must run before SET NOT
      // NULL, or an existing null value from an older schema could make
      // this migration fail against real data.
      expect(backfillMatch!.index).toBeLessThan(notNullMatch!.index!);
    }
  });

  it('re-installs the Paddle status CHECK constraint explicitly (DROP IF EXISTS + ADD), not only via the CREATE TABLE inline form', () => {
    expect(sql).toMatch(
      /alter table public\.business_subscriptions\s*\n\s*drop constraint if exists business_subscriptions_status_check;/
    );
    expect(sql).toMatch(
      /alter table public\.business_subscriptions\s*\n\s*add constraint business_subscriptions_status_check\s*\n\s*check \(status in \('trialing', 'active', 'past_due', 'paused', 'canceled'\)\);/
    );

    const dropIndex = sql.indexOf('drop constraint if exists business_subscriptions_status_check');
    const addIndex = sql.indexOf('add constraint business_subscriptions_status_check', dropIndex);
    expect(addIndex).toBeGreaterThan(dropIndex);
  });

  it('raises a clear diagnostic exception instead of an opaque constraint-violation when an existing row has a non-Paddle status', () => {
    const doBlockIndex = sql.indexOf(
      'do $$',
      sql.indexOf('add column if not exists has_paddle_customer')
    );
    const dropConstraintIndex = sql.indexOf(
      'drop constraint if exists business_subscriptions_status_check'
    );
    expect(doBlockIndex).toBeGreaterThan(-1);
    expect(doBlockIndex).toBeLessThan(dropConstraintIndex);

    const preCheckBlock = sql.slice(doBlockIndex, dropConstraintIndex);
    expect(preCheckBlock).toMatch(
      /where status not in \('trialing', 'active', 'past_due', 'paused', 'canceled'\);/
    );
    expect(preCheckBlock).toMatch(/raise exception/);
    expect(preCheckBlock).not.toMatch(/\bdelete from\b/i);
    expect(preCheckBlock).not.toMatch(/\bupdate\b/i);
  });

  it('installs business_id/paddle_customer_id/paddle_subscription_id unique indexes explicitly, using CREATE UNIQUE INDEX IF NOT EXISTS rather than relying on the CREATE TABLE inline form', () => {
    expect(sql).toMatch(
      /create unique index if not exists business_subscriptions_business_id_key\s*\n\s*on public\.business_subscriptions \(business_id\);/
    );
    expect(sql).toMatch(
      /create unique index if not exists business_subscriptions_paddle_customer_id_key\s*\n\s*on public\.business_subscriptions \(paddle_customer_id\);/
    );
    expect(sql).toMatch(
      /create unique index if not exists business_subscriptions_paddle_subscription_id_key\s*\n\s*on public\.business_subscriptions \(paddle_subscription_id\);/
    );
  });

  it('raises a clear diagnostic instead of a bare unique-violation for each uniqueness index, and never merges or deletes a duplicate row itself', () => {
    const columns: Array<{ column: string; indexName: string }> = [
      { column: 'business_id', indexName: 'business_subscriptions_business_id_key' },
      { column: 'paddle_customer_id', indexName: 'business_subscriptions_paddle_customer_id_key' },
      {
        column: 'paddle_subscription_id',
        indexName: 'business_subscriptions_paddle_subscription_id_key'
      }
    ];

    for (const { column, indexName } of columns) {
      const indexStatement = `create unique index if not exists ${indexName}`;
      const indexPos = sql.indexOf(indexStatement);
      expect(indexPos, `missing unique index for ${column}`).toBeGreaterThan(-1);

      // The nearest preceding `do $$ ... end $$;` block is this
      // column's duplicate pre-check — it must exist, must come before
      // the index it guards, must raise a clear exception, and must
      // never itself delete or merge a row.
      const doBlockStart = sql.lastIndexOf('do $$', indexPos);
      expect(doBlockStart, `missing duplicate pre-check for ${column}`).toBeGreaterThan(-1);
      const doBlockEnd = sql.indexOf('end $$;', doBlockStart);
      expect(doBlockEnd).toBeLessThan(indexPos);

      const preCheckBlock = sql.slice(doBlockStart, doBlockEnd);
      expect(preCheckBlock).toMatch(new RegExp(`group by ${column}\\b`));
      expect(preCheckBlock).toMatch(/having count\(\*\) > 1/);
      expect(preCheckBlock).toMatch(/raise exception/);
      expect(preCheckBlock).not.toMatch(/\bdelete from\b/i);
      expect(preCheckBlock).not.toMatch(/\bupdate\b/i);
    }
  });

  it('never creates a duplicate-equivalent index for the same column on a rerun — each uniqueness index is declared exactly once', () => {
    for (const indexName of [
      'business_subscriptions_business_id_key',
      'business_subscriptions_paddle_customer_id_key',
      'business_subscriptions_paddle_subscription_id_key'
    ]) {
      const matches =
        sql.match(new RegExp(`create unique index if not exists ${indexName}\\b`, 'g')) ?? [];
      expect(matches).toHaveLength(1);
    }
  });

  it('upgrades billing_checkout_attempts the same way — adds paddle_transaction_id explicitly, since a Stripe-era table already exists under this name with stripe_checkout_session_id instead', () => {
    const tableStart = sql.indexOf('create table if not exists public.billing_checkout_attempts');
    const indexStart = sql.indexOf(
      'create unique index if not exists billing_checkout_attempts_one_pending_per_business'
    );
    expect(tableStart).toBeGreaterThan(-1);
    expect(indexStart).toBeGreaterThan(tableStart);

    const upgradeSection = sql.slice(tableStart, indexStart);
    expect(upgradeSection).toMatch(
      /alter table public\.billing_checkout_attempts\s*\n\s*add column if not exists paddle_transaction_id text;/
    );
  });

  it('never drops, deletes from, or truncates any legacy Stripe-era column or table — stripe_* columns and stripe_checkout_session_id are left in place untouched', () => {
    expect(sql).not.toMatch(/\btruncate\b/i);
    expect(sql).not.toMatch(/\bdelete from\b/i);
    expect(sql).not.toMatch(/drop column/i);
  });
});
