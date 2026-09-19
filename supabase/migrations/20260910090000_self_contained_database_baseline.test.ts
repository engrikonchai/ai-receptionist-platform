import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static contract for the self-contained database baseline migration —
 * verified against the actual SQL text, same approach as this repo's
 * other migration tests (no live Postgres instance in this
 * environment). Not a substitute for the manual local Supabase
 * verification described in this branch's PR/report.
 */
const MIGRATIONS_DIR = import.meta.dirname;
const FILENAME = '20260910090000_self_contained_database_baseline.sql';
const sql = readFileSync(path.join(MIGRATIONS_DIR, FILENAME), 'utf8');

// Same approach as this repo's other migration tests: strips full `--`
// comment lines so "never does X" checks assert against what the
// migration actually executes, not against its own prose explaining what
// it deliberately does or does not do.
const executableSql = sql
  .split('\n')
  .filter((line) => !/^\s*--/.test(line))
  .join('\n');

const FOUNDATIONAL_TABLES = [
  'profiles',
  'businesses',
  'knowledge_items',
  'conversations',
  'messages',
  'leads',
  'handoffs',
  'widget_settings'
];

describe('self-contained database baseline migration — ordering', () => {
  it('is timestamped earlier than every other migration in this directory', () => {
    const allMigrations = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .toSorted();

    expect(allMigrations[0]).toBe(FILENAME);
    // Every other .sql file's own leading timestamp must sort after this one.
    const ownTimestamp = FILENAME.slice(0, 14);
    for (const file of allMigrations) {
      if (file === FILENAME) continue;
      const otherTimestamp = file.slice(0, 14);
      expect(otherTimestamp >= ownTimestamp).toBe(true);
    }
  });
});

describe('self-contained database baseline migration — every foundational table', () => {
  for (const table of FOUNDATIONAL_TABLES) {
    it(`creates public.${table} guarded by if not exists`, () => {
      const re = new RegExp(`create table if not exists public\\.${table}\\s*\\(`, 'i');
      expect(sql).toMatch(re);
    });

    it(`enables Row Level Security on public.${table}`, () => {
      const re = new RegExp(`alter table public\\.${table} enable row level security;`, 'i');
      expect(sql).toMatch(re);
    });

    it(`validates public.${table}'s required columns and primary key against a pre-existing incompatible table`, () => {
      const createIndex = sql.indexOf(`create table if not exists public.${table} `);
      expect(createIndex).toBeGreaterThanOrEqual(0);
      const nextTableIndex = sql.indexOf('create table if not exists public.', createIndex + 1);
      const section = sql.slice(createIndex, nextTableIndex === -1 ? sql.length : nextTableIndex);

      expect(section).toMatch(/information_schema\.columns/);
      expect(section).toMatch(/information_schema\.table_constraints/);
      expect(section).toMatch(/constraint_type = 'PRIMARY KEY'/);
      expect(section).toMatch(/raise exception/);
      // The exception message never interpolates row data — only a
      // fixed table/column-name string and, where relevant, a bare count.
      expect(section).not.toMatch(/raise exception[^;]*select \*/i);
    });
  }
});

describe('self-contained database baseline migration — primary/foreign keys', () => {
  it('profiles.id is the primary key and references auth.users(id)', () => {
    expect(sql).toMatch(/id uuid primary key references auth\.users \(id\) on delete cascade/);
  });

  it('businesses.owner_id references auth.users(id), and businesses.id is a uuid primary key with a generated default', () => {
    expect(sql).toMatch(/owner_id uuid references auth\.users \(id\) on delete cascade/);
    expect(sql).toMatch(
      /create table if not exists public\.businesses \(\s*id uuid primary key default gen_random_uuid\(\)/
    );
  });

  it('knowledge_items/conversations/leads/handoffs/widget_settings.business_id all reference public.businesses(id)', () => {
    const matches =
      executableSql.match(/business_id uuid( not null)? references public\.businesses \(id\)/g) ??
      [];
    expect(matches.length).toBe(5);
  });

  it('messages.conversation_id references public.conversations(id) on delete cascade', () => {
    expect(sql).toMatch(
      /conversation_id uuid not null references public\.conversations \(id\) on delete cascade/
    );
  });

  it('leads.conversation_id and handoffs.conversation_id are nullable and reference public.conversations(id) on delete set null', () => {
    const matches =
      executableSql.match(
        /conversation_id uuid references public\.conversations \(id\) on delete set null/g
      ) ?? [];
    expect(matches.length).toBe(2);
  });

  it('never uses on delete cascade from a nullable conversation_id reference', () => {
    expect(executableSql).not.toMatch(
      /conversation_id uuid references public\.conversations \(id\) on delete cascade/
    );
  });
});

describe('self-contained database baseline migration — uniqueness', () => {
  it('creates businesses_public_widget_id_key, preceded by a duplicate pre-check', () => {
    const idx = sql.indexOf('create unique index if not exists businesses_public_widget_id_key');
    expect(idx).toBeGreaterThan(0);
    const preCheck = sql.slice(Math.max(0, idx - 700), idx);
    expect(preCheck).toMatch(/group by public_widget_id/);
    expect(preCheck).toMatch(/having count\(\*\) > 1/);
    expect(preCheck).toMatch(/raise exception/);
  });

  it('creates businesses_slug_key, preceded by a duplicate pre-check', () => {
    const idx = sql.indexOf('create unique index if not exists businesses_slug_key');
    expect(idx).toBeGreaterThan(0);
    const preCheck = sql.slice(Math.max(0, idx - 700), idx);
    expect(preCheck).toMatch(/group by slug/);
    expect(preCheck).toMatch(/having count\(\*\) > 1/);
    expect(preCheck).toMatch(/raise exception/);
  });

  it('creates widget_settings_business_id_key, preceded by a duplicate pre-check', () => {
    const idx = sql.indexOf('create unique index if not exists widget_settings_business_id_key');
    expect(idx).toBeGreaterThan(0);
    const preCheck = sql.slice(Math.max(0, idx - 700), idx);
    expect(preCheck).toMatch(/group by business_id/);
    expect(preCheck).toMatch(/having count\(\*\) > 1/);
    expect(preCheck).toMatch(/raise exception/);
  });

  it('never adds a uniqueness constraint on leads.reference (no known uniqueness requirement — see runtime.ts)', () => {
    expect(executableSql).not.toMatch(/unique index[^;]*\breference\b/i);
    expect(executableSql).not.toMatch(/references_key/i);
  });

  it('is compatible with businesses_owner_id_key by never creating it itself (owned by 20260921090000_single_business_per_owner.sql)', () => {
    expect(executableSql).not.toMatch(/businesses_owner_id_key/);
    expect(executableSql).not.toMatch(/create unique index[^;]*\(owner_id\)/i);
  });
});

describe('self-contained database baseline migration — check constraints match known enum vocabularies', () => {
  it('conversations.channel and .status are constrained to their known values', () => {
    expect(sql).toMatch(/check \(channel in \('website', 'instagram', 'whatsapp'\)\)/);
    expect(sql).toMatch(/check \(status in \('open', 'closed', 'handed_off'\)\)/);
  });

  it('messages.role is constrained to its known values', () => {
    expect(sql).toMatch(/check \(role in \('user', 'assistant', 'system'\)\)/);
  });

  it('leads.source and .status are constrained to their known values', () => {
    expect(sql).toMatch(/check \(source in \('website', 'instagram', 'whatsapp'\)\)/);
    expect(sql).toMatch(/check \(status in \('new', 'contacted', 'confirmed', 'lost'\)\)/);
  });

  it('handoffs.status is constrained to its known values', () => {
    expect(sql).toMatch(/check \(status in \('new', 'contacted', 'resolved'\)\)/);
  });

  it('widget_settings.position is constrained to its known values', () => {
    expect(sql).toMatch(/check \("position" in \('bottom-right', 'bottom-left'\)\)/);
  });
});

describe('self-contained database baseline migration — timestamp defaults and updated_at triggers', () => {
  it('every created_at/updated_at column defaults to now()', () => {
    const createdAtDefaults =
      executableSql.match(/created_at timestamptz not null default now\(\)/g) ?? [];
    const updatedAtDefaults =
      executableSql.match(/updated_at timestamptz not null default now\(\)/g) ?? [];
    // One created_at per table (8), one updated_at per table except messages (7).
    expect(createdAtDefaults.length).toBe(8);
    expect(updatedAtDefaults.length).toBe(7);
  });

  it('messages has no updated_at column and no updated_at trigger', () => {
    const createIndex = sql.indexOf('create table if not exists public.messages (');
    const nextTableIndex = sql.indexOf('create table if not exists public.', createIndex + 1);
    const section = sql.slice(createIndex, nextTableIndex === -1 ? sql.length : nextTableIndex);
    expect(section).not.toMatch(/updated_at/);
  });

  it('installs set_updated_at() and a per-table trigger for every table except messages', () => {
    expect(sql).toMatch(/create or replace function public\.set_updated_at\(\)/);
    const tablesWithUpdatedAt = FOUNDATIONAL_TABLES.filter((t) => t !== 'messages');
    for (const table of tablesWithUpdatedAt) {
      const re = new RegExp(
        `create trigger set_updated_at_${table}\\s*\\n\\s*before update on public\\.${table}`,
        'i'
      );
      expect(sql).toMatch(re);
    }
  });

  it('every updated_at trigger name is scoped to this migration and dropped only by that same exact name first', () => {
    const dropMatches =
      executableSql.match(/drop trigger if exists set_updated_at_\w+ on public\.\w+;/g) ?? [];
    expect(dropMatches.length).toBe(7);
    // Every drop must be immediately followed by the matching create, never a bare drop.
    for (const dropStatement of dropMatches) {
      const triggerName = dropStatement.match(/set_updated_at_(\w+) on/)?.[1];
      expect(executableSql).toMatch(new RegExp(`create trigger set_updated_at_${triggerName}\\b`));
    }
  });
});

describe('self-contained database baseline migration — scope: excludes columns/objects owned by later migrations', () => {
  it('never creates profiles.onboarding_completed / onboarding_completed_at (owned by 20260915000100)', () => {
    expect(executableSql).not.toMatch(/onboarding_completed/);
  });

  it('never creates messages.sender_type / client_message_id (owned by 20260915170200)', () => {
    expect(executableSql).not.toMatch(/sender_type/);
    expect(executableSql).not.toMatch(/client_message_id/);
  });

  it('never creates widget_settings.widget_enabled / allowed_origins (owned by 20260916120000)', () => {
    expect(executableSql).not.toMatch(/widget_enabled/);
    expect(executableSql).not.toMatch(/allowed_origins/);
  });

  it('never creates widget_settings.installation_confirmed / installation_confirmed_at (owned by 20260917140000)', () => {
    expect(executableSql).not.toMatch(/installation_confirmed/);
  });

  it('never creates handoffs.client_request_id (owned by 20260918090000)', () => {
    expect(executableSql).not.toMatch(/client_request_id/);
  });

  it('never creates any RLS policy — every owner policy is owned by its own existing migration', () => {
    expect(executableSql).not.toMatch(/create policy/i);
    expect(executableSql).not.toMatch(/drop policy/i);
  });

  it('never creates any Paddle/billing/rate-limit table or the resolve_widget_config function — all owned by their own existing migrations', () => {
    expect(executableSql).not.toMatch(/business_subscriptions/i);
    expect(executableSql).not.toMatch(/billing_checkout_attempts/i);
    expect(executableSql).not.toMatch(/paddle_webhook_events/i);
    expect(executableSql).not.toMatch(/widget_rate_limits/i);
    expect(executableSql).not.toMatch(/resolve_widget_config/i);
    expect(executableSql).not.toMatch(/handle_new_user/i);
    expect(executableSql).not.toMatch(/on_auth_user_created/i);
  });
});

describe('self-contained database baseline migration — safety', () => {
  it('never deletes, truncates, or rewrites any row', () => {
    expect(executableSql).not.toMatch(/\bdelete from\b/i);
    expect(executableSql).not.toMatch(/\btruncate\b/i);
    expect(executableSql).not.toMatch(/\bupdate public\./i);
  });

  it('never drops, renames, or alters the type of an existing table or column', () => {
    expect(executableSql).not.toMatch(/\bdrop table\b/i);
    expect(executableSql).not.toMatch(/\brename\b/i);
    expect(executableSql).not.toMatch(/\balter column\b/i);
    expect(executableSql).not.toMatch(/\btype\b.*\busing\b/i);
  });

  it('never drops an RLS policy, grant, index, constraint, or (pre-existing-named) trigger', () => {
    expect(executableSql).not.toMatch(/\bdrop policy\b/i);
    expect(executableSql).not.toMatch(/\bdrop index\b/i);
    expect(executableSql).not.toMatch(/\bdrop constraint\b/i);
    // The only "drop trigger" statements are this migration's own
    // set_updated_at_<table> triggers, dropped only by that exact,
    // migration-owned name immediately before recreating them (checked
    // exhaustively above) — never a bare, unscoped drop trigger.
    const dropTriggerMatches = executableSql.match(/drop trigger[^;]*;/gi) ?? [];
    for (const statement of dropTriggerMatches) {
      expect(statement).toMatch(/set_updated_at_/);
    }
  });

  it('never disables Row Level Security anywhere', () => {
    expect(executableSql).not.toMatch(/disable row level security/i);
  });

  it("never issues a grant or revoke of any kind — table-level access for anon/authenticated is left to this Supabase project's own default privileges, exactly like every other migration that creates a plain owner-scoped table in this repo", () => {
    expect(executableSql).not.toMatch(/\bgrant\b/i);
    expect(executableSql).not.toMatch(/\brevoke\b/i);
  });

  it('never touches auth.users beyond an ordinary foreign-key reference — no ALTER, no ownership/permission change, no SET ROLE', () => {
    expect(executableSql).not.toMatch(/alter table auth\.users/i);
    expect(executableSql).not.toMatch(/owner to/i);
    expect(executableSql).not.toMatch(/grant[^;]*on[^;]*auth\.users/i);
    expect(executableSql).not.toMatch(/revoke[^;]*on[^;]*auth\.users/i);
    expect(executableSql).not.toMatch(/set role/i);
    expect(executableSql).not.toMatch(/supabase_auth_admin/i);
    // The only permitted mentions of auth.users are the two `references
    // auth.users (id)` foreign keys.
    const authUsersMentions = executableSql.match(/auth\.users/g) ?? [];
    expect(authUsersMentions.length).toBe(2);
  });

  it('contains no real user data, emails, business IDs, or secrets — every literal value is a generic placeholder or a structural default', () => {
    expect(sql).not.toMatch(/@gmail\.com|@example\.com|@outlook\.com|@yahoo\.com/i);
    expect(sql).not.toMatch(/sk_live|whsec_|ntfy_|service_role.{0,20}key/i);
  });
});
