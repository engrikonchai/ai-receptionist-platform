import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static contract for the self-contained database baseline migration —
 * verified against the actual SQL text, same approach as this repo's
 * other migration tests (no live Postgres instance in this
 * environment). Not a substitute for the manual local Supabase
 * verification described in this branch's PR/report.
 *
 * Revision 2: corrected after a read-only comparison of the first
 * revision against the actual live production Supabase schema found
 * three mistakes — businesses.owner_id referenced auth.users directly
 * instead of public.profiles(id); leads.reference was believed
 * unconstrained but is actually unique (leads_reference_key); and the
 * updated_at trigger mechanism, while correctly inferred to exist, used
 * invented per-table names instead of the one verified shared name
 * `set_updated_at`.
 *
 * Revision 3: a further pg_catalog comparison found three remaining
 * exactness gaps — businesses_public_widget_id_key/businesses_slug_key/
 * leads_reference_key/widget_settings_business_id_key are real named
 * pg_constraint UNIQUE objects in production, not bare unique indexes;
 * leads' date/guest CHECK constraints used an invented name and a
 * non-strict `>=` instead of the verified `leads_dates_check` with
 * strict `check_out > check_in`; and several CHECK constraint names and
 * every plain performance index were invented rather than matching the
 * verified live set. These tests assert the corrected, verified shape.
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

const TABLES_WITH_UPDATED_AT = FOUNDATIONAL_TABLES.filter((t) => t !== 'messages');

describe('self-contained database baseline migration — ordering', () => {
  it('is timestamped earlier than every other migration in this directory', () => {
    const allMigrations = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .toSorted();

    expect(allMigrations[0]).toBe(FILENAME);
    const ownTimestamp = FILENAME.slice(0, 14);
    for (const file of allMigrations) {
      if (file === FILENAME) continue;
      const otherTimestamp = file.slice(0, 14);
      expect(otherTimestamp >= ownTimestamp).toBe(true);
    }
  });

  it('documents that it is a fresh-database baseline, not something to casually run against production', () => {
    expect(sql).toMatch(/MIGRATION-ORDER WARNING/);
    expect(sql).toMatch(/not meant to be/i);
    expect(sql).toMatch(/casually executed against/i);
    expect(sql).toMatch(/production already contains/i);
    expect(sql).toMatch(/migration repair/i);
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
      expect(section).not.toMatch(/raise exception[^;]*select \*/i);
    });
  }
});

describe('self-contained database baseline migration — verified foreign keys', () => {
  it('profiles.id references auth.users(id) on delete cascade (VERIFIED live)', () => {
    expect(sql).toMatch(/id uuid primary key references auth\.users \(id\) on delete cascade,/);
  });

  it('businesses.owner_id references public.profiles(id) on delete cascade — NOT auth.users (VERIFIED live, corrected)', () => {
    expect(sql).toMatch(/owner_id uuid references public\.profiles \(id\) on delete cascade,/);
    expect(executableSql).not.toMatch(/owner_id uuid references auth\.users/);
  });

  it('knowledge_items/conversations/leads/handoffs/widget_settings.business_id all reference public.businesses(id) on delete cascade', () => {
    const matches =
      executableSql.match(
        /business_id uuid( not null)? references public\.businesses \(id\) on delete cascade/g
      ) ?? [];
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

  it('auth.users is referenced exactly once in the whole migration — only by profiles.id', () => {
    const authUsersMentions = executableSql.match(/auth\.users/g) ?? [];
    expect(authUsersMentions.length).toBe(1);
  });
});

// The four VERIFIED live named UNIQUE constraints this baseline owns —
// real pg_constraint UNIQUE objects in production, not bare unique
// indexes (REVISION 3).
const NAMED_UNIQUE_CONSTRAINTS: Array<{ name: string; table: string; column: string }> = [
  { name: 'businesses_public_widget_id_key', table: 'businesses', column: 'public_widget_id' },
  { name: 'businesses_slug_key', table: 'businesses', column: 'slug' },
  { name: 'leads_reference_key', table: 'leads', column: 'reference' },
  { name: 'widget_settings_business_id_key', table: 'widget_settings', column: 'business_id' }
];

describe('self-contained database baseline migration — verified uniqueness: real named UNIQUE constraints, not bare indexes', () => {
  for (const { name, table, column } of NAMED_UNIQUE_CONSTRAINTS) {
    it(`${name} is declared inline as a named UNIQUE table constraint on public.${table}(${column}), never a bare CREATE UNIQUE INDEX`, () => {
      // A "constraint <name> unique (<column>)" clause both registers a
      // pg_constraint UNIQUE row AND auto-creates a same-named backing
      // index — a bare `create unique index <name> on ...` only ever
      // produces the index, never the pg_constraint row. Assert the
      // former is present for a blank-database create, and the latter
      // form is never used for this object anywhere in the file.
      const inlineRe = new RegExp(`constraint ${name} unique \\(${column}\\)`);
      expect(sql).toMatch(inlineRe);
      expect(executableSql).not.toMatch(new RegExp(`create unique index if not exists ${name}\\b`));
    });

    it(`${name} has a duplicate preflight and a fallback ALTER TABLE ADD CONSTRAINT for a pre-existing table missing it`, () => {
      const idx = sql.indexOf(`add constraint ${name} unique (${column});`);
      expect(idx).toBeGreaterThan(0);
      const preceding = sql.slice(Math.max(0, idx - 1400), idx);
      expect(preceding).toMatch(/group by/);
      expect(preceding).toMatch(/having count\(\*\) > 1/);
      expect(preceding).toMatch(/raise exception/);
      expect(preceding).toMatch(
        new RegExp(`constraint_name = '${name}' and constraint_type = 'UNIQUE'`)
      );
    });
  }

  it('never describes leads.reference as unconstrained or lacking a uniqueness requirement', () => {
    expect(sql).not.toMatch(/reference[\s\S]{0,80}no known uniqueness requirement/i);
    expect(sql).not.toMatch(/reference[\s\S]{0,80}not a security token/i);
  });

  it('businesses_owner_id_key remains the intentionally PARTIAL unique index, never converted into a full table constraint or otherwise created here (owned entirely by 20260921090000_single_business_per_owner.sql)', () => {
    expect(executableSql).not.toMatch(/businesses_owner_id_key/);
    expect(executableSql).not.toMatch(/create unique index[^;]*\(owner_id\)/i);
    expect(executableSql).not.toMatch(/constraint businesses_owner_id_key/i);
  });
});

// Every CHECK constraint this baseline owns, under its exact VERIFIED
// live name (REVISION 3). messages_sender_type_check is deliberately
// excluded — it stays owned entirely by
// 20260915170200_inbox_human_replies.sql, the migration that introduces
// the sender_type column itself.
const VERIFIED_CHECK_CONSTRAINT_NAMES = [
  'businesses_supported_languages_not_empty',
  'conversations_channel_check',
  'conversations_status_check',
  'messages_content_length_check',
  'messages_role_check',
  'leads_dates_check',
  'leads_guest_count_check',
  'leads_source_check',
  'leads_status_check',
  'handoffs_status_check',
  'widget_settings_position_check'
];

describe('self-contained database baseline migration — verified check constraints, under their exact verified names', () => {
  for (const name of VERIFIED_CHECK_CONSTRAINT_NAMES) {
    it(`declares a constraint named exactly \`${name}\``, () => {
      const re = new RegExp(`constraint ${name}\\b`);
      expect(sql).toMatch(re);
    });
  }

  it('businesses.supported_languages must be non-empty (businesses_supported_languages_not_empty — no "_check" suffix, matching the verified live name exactly)', () => {
    expect(sql).toMatch(
      /constraint businesses_supported_languages_not_empty\s*\n\s*check \(cardinality\(supported_languages\) > 0\)/
    );
    expect(executableSql).not.toMatch(/businesses_supported_languages_not_empty_check/);
  });

  it('conversations.channel and .status are constrained to their known values', () => {
    expect(sql).toMatch(/check \(channel in \('website', 'instagram', 'whatsapp'\)\)/);
    expect(sql).toMatch(/check \(status in \('open', 'closed', 'handed_off'\)\)/);
  });

  it('messages.role is constrained to its known values and content length is 1-4000', () => {
    expect(sql).toMatch(/check \(role in \('user', 'assistant', 'system'\)\)/);
    expect(sql).toMatch(/check \(char_length\(content\) between 1 and 4000\)/);
  });

  it('never adds a messages.sender_type CHECK constraint — owned entirely by 20260915170200_inbox_human_replies.sql', () => {
    expect(executableSql).not.toMatch(/sender_type/);
    expect(executableSql).not.toMatch(/messages_sender_type_check/);
  });

  it('leads.source and .status are constrained to their known values', () => {
    expect(sql).toMatch(/check \(source in \('website', 'instagram', 'whatsapp'\)\)/);
    expect(sql).toMatch(/check \(status in \('new', 'contacted', 'confirmed', 'lost'\)\)/);
  });

  it('leads_dates_check uses a STRICT check_out > check_in (VERIFIED live, corrected in REVISION 3 from a non-strict >= under an invented name)', () => {
    expect(sql).toMatch(
      /constraint leads_dates_check\s*\n\s*check \(\s*\n\s*check_in is null\s*\n\s*or check_out is null\s*\n\s*or check_out > check_in\s*\n\s*\)/
    );
    expect(executableSql).not.toMatch(/check_out >= check_in/);
    expect(executableSql).not.toMatch(/leads_check_out_after_check_in_check/);
  });

  it('leads_guest_count_check matches the exact verified live text', () => {
    expect(sql).toMatch(
      /constraint leads_guest_count_check\s*\n\s*check \(\s*\n\s*guest_count is null\s*\n\s*or \(guest_count >= 1 and guest_count <= 4\)\s*\n\s*\)/
    );
  });

  it('handoffs.status is constrained to its known values', () => {
    expect(sql).toMatch(/check \(status in \('new', 'contacted', 'resolved'\)\)/);
  });

  it('widget_settings.position is constrained to its known values', () => {
    expect(sql).toMatch(/check \("position" in \('bottom-right', 'bottom-left'\)\)/);
  });
});

// The exact VERIFIED live plain performance indexes this baseline owns
// (REVISION 3) — no later migration creates any of these, so this
// baseline is where they belong. businesses_public_widget_id_idx (a
// redundant historical duplicate of businesses_public_widget_id_key) and
// the later-column indexes handoffs_client_request_id_key/
// messages_client_message_id_key are deliberately excluded — see this
// migration's own FINAL SCHEMA DIFFERENCES / SCOPE sections.
const VERIFIED_PERFORMANCE_INDEXES: Array<{ name: string; table: string; columns: string }> = [
  { name: 'businesses_owner_id_idx', table: 'businesses', columns: '(owner_id)' },
  {
    name: 'conversations_business_created_idx',
    table: 'conversations',
    columns: '(business_id, created_at desc)'
  },
  { name: 'conversations_business_id_idx', table: 'conversations', columns: '(business_id)' },
  { name: 'conversations_visitor_id_idx', table: 'conversations', columns: '(visitor_id)' },
  {
    name: 'handoffs_business_created_idx',
    table: 'handoffs',
    columns: '(business_id, created_at desc)'
  },
  { name: 'handoffs_business_id_idx', table: 'handoffs', columns: '(business_id)' },
  { name: 'knowledge_items_business_id_idx', table: 'knowledge_items', columns: '(business_id)' },
  {
    name: 'knowledge_items_business_sort_idx',
    table: 'knowledge_items',
    columns: '(business_id, sort_order)'
  },
  { name: 'leads_business_created_idx', table: 'leads', columns: '(business_id, created_at desc)' },
  { name: 'leads_business_id_idx', table: 'leads', columns: '(business_id)' },
  { name: 'leads_status_idx', table: 'leads', columns: '(status)' },
  {
    name: 'messages_conversation_created_idx',
    table: 'messages',
    columns: '(conversation_id, created_at)'
  },
  { name: 'messages_conversation_id_idx', table: 'messages', columns: '(conversation_id)' }
];

describe('self-contained database baseline migration — verified performance index reconciliation', () => {
  for (const { name, table, columns } of VERIFIED_PERFORMANCE_INDEXES) {
    it(`creates ${name} on public.${table}${columns}, guarded by if not exists`, () => {
      const escapedColumns = columns.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(
        `create index if not exists ${name}\\s*\\n\\s*on public\\.${table} ${escapedColumns};`
      );
      expect(sql).toMatch(re);
    });
  }

  it('creates exactly 13 plain performance indexes — no invented indexes beyond the verified live set', () => {
    const allPlainIndexes = executableSql.match(/create index if not exists \w+/g) ?? [];
    expect(allPlainIndexes.length).toBe(VERIFIED_PERFORMANCE_INDEXES.length);
    const names = allPlainIndexes.map((s) => s.replace('create index if not exists ', ''));
    expect(new Set(names)).toEqual(new Set(VERIFIED_PERFORMANCE_INDEXES.map((i) => i.name)));
  });

  it('never recreates the invented, differently-shaped indexes from earlier revisions', () => {
    const invented = [
      'knowledge_items_business_id_sort_order_created_at_idx',
      'conversations_business_id_updated_at_idx',
      'leads_business_id_created_at_idx',
      'leads_conversation_id_created_at_idx',
      'handoffs_business_id_created_at_idx',
      'handoffs_conversation_id_created_at_idx',
      'messages_conversation_id_created_at_idx'
    ];
    for (const name of invented) {
      expect(executableSql).not.toMatch(new RegExp(`\\b${name}\\b`));
    }
  });

  it('never reproduces the redundant businesses_public_widget_id_idx — documented as an intentional final-schema difference', () => {
    expect(executableSql).not.toMatch(/businesses_public_widget_id_idx/);
    expect(sql).toMatch(/FINAL SCHEMA DIFFERENCES/);
    expect(sql).toMatch(/businesses_public_widget_id_idx/);
  });

  it('never duplicates the later-column indexes handoffs_client_request_id_key or messages_client_message_id_key', () => {
    expect(executableSql).not.toMatch(/handoffs_client_request_id_key/);
    expect(executableSql).not.toMatch(/messages_client_message_id_key/);
  });
});

describe('self-contained database baseline migration — verified set_updated_at() function and triggers', () => {
  it('set_updated_at() is plpgsql, SECURITY INVOKER, with no search_path override, matching the live function exactly', () => {
    const fnStart = sql.indexOf('create or replace function public.set_updated_at()');
    const fnEnd = sql.indexOf('$$;', fnStart) + 3;
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnSection = sql.slice(fnStart, fnEnd);

    expect(fnSection).toMatch(/returns trigger/);
    expect(fnSection).toMatch(/language plpgsql/);
    expect(fnSection).toMatch(/security invoker/);
    expect(fnSection).not.toMatch(/security definer/i);
    expect(fnSection).not.toMatch(/set search_path/i);
    expect(fnSection).toMatch(/new\.updated_at = now\(\);/);
    expect(fnSection).toMatch(/return new;/);
  });

  it('never revokes or grants execute on set_updated_at() — it stays PUBLIC-executable, matching the live function', () => {
    expect(executableSql).not.toMatch(/revoke[^;]*set_updated_at/i);
    expect(executableSql).not.toMatch(/grant[^;]*set_updated_at/i);
  });

  it('every trigger uses the one verified shared name `set_updated_at`, never a per-table invented name', () => {
    expect(executableSql).not.toMatch(/set_updated_at_\w+/);
  });

  it('installs a BEFORE UPDATE set_updated_at trigger on every table except messages', () => {
    for (const table of TABLES_WITH_UPDATED_AT) {
      const re = new RegExp(
        `drop trigger if exists set_updated_at on public\\.${table};\\s*\\n\\s*create trigger set_updated_at\\s*\\n\\s*before update on public\\.${table}`,
        'i'
      );
      expect(sql).toMatch(re);
    }
  });

  it('messages has no set_updated_at trigger and no updated_at column', () => {
    const createIndex = sql.indexOf('create table if not exists public.messages (');
    const nextTableIndex = sql.indexOf('create table if not exists public.', createIndex + 1);
    const section = sql.slice(createIndex, nextTableIndex === -1 ? sql.length : nextTableIndex);
    expect(section).not.toMatch(/updated_at/);
    expect(section).not.toMatch(/set_updated_at/);
  });

  it('every drop trigger statement is scoped to `set_updated_at` and immediately followed by its recreation, never a bare drop', () => {
    const dropMatches =
      executableSql.match(/drop trigger if exists set_updated_at on public\.\w+;/g) ?? [];
    expect(dropMatches.length).toBe(TABLES_WITH_UPDATED_AT.length);
    for (const dropStatement of dropMatches) {
      const table = dropStatement.match(/on public\.(\w+);/)?.[1];
      const re = new RegExp(
        `drop trigger if exists set_updated_at on public\\.${table};\\s*\\n\\s*create trigger set_updated_at`
      );
      expect(executableSql).toMatch(re);
    }
  });
});

describe('self-contained database baseline migration — timestamp defaults', () => {
  it('every created_at/updated_at column defaults to now()', () => {
    const createdAtDefaults =
      executableSql.match(/created_at timestamptz not null default now\(\)/g) ?? [];
    const updatedAtDefaults =
      executableSql.match(/updated_at timestamptz not null default now\(\)/g) ?? [];
    expect(createdAtDefaults.length).toBe(8);
    expect(updatedAtDefaults.length).toBe(7);
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

describe('self-contained database baseline migration — grants', () => {
  it('never issues a grant or revoke on any of the eight foundational tables or on set_updated_at() — relies on Supabase project default privileges, documented explicitly', () => {
    expect(executableSql).not.toMatch(/\bgrant\b/i);
    expect(executableSql).not.toMatch(/\brevoke\b/i);
    expect(sql).toMatch(/GRANTS/);
    expect(sql).toMatch(/ALTER DEFAULT/i);
    expect(sql).toMatch(/PRIVILEGES/i);
  });

  it('never grants or references the billing/internal service-role-only tables', () => {
    expect(executableSql).not.toMatch(/business_subscriptions/i);
    expect(executableSql).not.toMatch(/billing_checkout_attempts/i);
    expect(executableSql).not.toMatch(/paddle_webhook_events/i);
    expect(executableSql).not.toMatch(/widget_rate_limits/i);
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

  it("never drops an RLS policy, grant, index, or constraint, and every drop trigger is this migration's own scoped set_updated_at trigger", () => {
    expect(executableSql).not.toMatch(/\bdrop policy\b/i);
    expect(executableSql).not.toMatch(/\bdrop index\b/i);
    expect(executableSql).not.toMatch(/\bdrop constraint\b/i);
    const dropTriggerMatches = executableSql.match(/drop trigger[^;]*;/gi) ?? [];
    expect(dropTriggerMatches.length).toBe(TABLES_WITH_UPDATED_AT.length);
    for (const statement of dropTriggerMatches) {
      expect(statement).toMatch(/set_updated_at/);
    }
  });

  it('never disables Row Level Security anywhere, and never bypasses or weakens it', () => {
    expect(executableSql).not.toMatch(/disable row level security/i);
    expect(executableSql).not.toMatch(/force row level security/i);
    expect(executableSql).not.toMatch(/no force row level security/i);
  });

  it('never touches auth.users beyond the one ordinary foreign-key reference — no ALTER, no ownership/permission change, no SET ROLE', () => {
    expect(executableSql).not.toMatch(/alter table auth\.users/i);
    expect(executableSql).not.toMatch(/owner to/i);
    expect(executableSql).not.toMatch(/grant[^;]*on[^;]*auth\.users/i);
    expect(executableSql).not.toMatch(/revoke[^;]*on[^;]*auth\.users/i);
    expect(executableSql).not.toMatch(/set role/i);
    expect(executableSql).not.toMatch(/supabase_auth_admin/i);
  });

  it('contains no real user data, emails, business IDs, or secrets — every literal value is a generic placeholder or a structural default', () => {
    expect(sql).not.toMatch(/@gmail\.com|@example\.com|@outlook\.com|@yahoo\.com/i);
    expect(sql).not.toMatch(/sk_live|whsec_|ntfy_|service_role.{0,20}key/i);
  });

  it('separates verified live facts from inferred choices and unrunnable checks in its own header', () => {
    expect(sql).toMatch(/VERIFIED LIVE FACTS/);
    expect(sql).toMatch(/STILL INFERRED/);
    expect(sql).toMatch(/CANNOT BE RUNTIME-TESTED/);
  });
});
