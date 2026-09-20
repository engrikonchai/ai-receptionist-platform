/**
 * Signup/account-provisioning integration harness — the one place this
 * repository exercises the real Supabase Auth Admin API against a real
 * local Supabase stack, rather than a mocked Vitest test. Deliberately
 * NOT named `*.test.ts` so Vitest's default include glob never collects
 * it (see vitest.config.ts) — it needs a live local Supabase instance
 * (`bun run db:start`) and is run on its own via `bun run test:db:provisioning`
 * or as part of `bun run verify:db`, never as part of `bun run test`.
 *
 * Everything here is local-only: it reads the local stack's own URL and
 * keys straight from `supabase status -o json` (never a hardcoded value,
 * never this repo's production NEXT_PUBLIC_SUPABASE_URL/
 * SUPABASE_SERVICE_ROLE_KEY env vars) and creates two synthetic accounts
 * via the Auth Admin API (service-role only — never exposed to browser
 * code). Every value is synthetic and non-sensitive
 * (*@pgtap-provisioning.test.local addresses, throwaway passwords).
 *
 * What this proves that the pure-SQL pgTAP suite
 * (supabase/tests/*_test.sql) does not: that a *real* signup through the
 * real Auth Admin API — not a hand-written INSERT into auth.users —
 * fires this repository's own on_auth_user_created trigger and produces
 * exactly the rows the application expects, with no dependency on the
 * older, external ChatbotDemo project (this local stack never had any
 * ChatbotDemo migration applied to it at all).
 */
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

type Fail = { step: string; message: string };
const failures: Fail[] = [];

function log(message: string): void {
  console.error(message);
}

function check(step: string, condition: boolean, message: string): void {
  if (condition) {
    log(`  ok — ${step}`);
  } else {
    log(`  FAIL — ${step}: ${message}`);
    failures.push({ step, message });
  }
}

function findValue(obj: unknown, patterns: RegExp[]): string | null {
  if (obj === null || typeof obj !== 'object') return null;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof value === 'string' && patterns.some((p) => p.test(key))) {
      return value;
    }
    if (typeof value === 'object') {
      const found = findValue(value, patterns);
      if (found) return found;
    }
  }
  return null;
}

/** Pulls the local stack's API URL and service-role key out of
 * `supabase status -o json`, tolerant of minor key-naming differences
 * across CLI versions rather than betting on one exact shape. */
function readLocalCredentials(): { url: string; serviceRoleKey: string } {
  const raw = execFileSync('bunx', ['supabase', 'status', '-o', 'json'], {
    encoding: 'utf8',
    cwd: process.cwd()
  });
  const status: unknown = JSON.parse(raw);

  const url = findValue(status, [/^api[_.]?url$/i, /^rest[_.]?url$/i]);
  const serviceRoleKey = findValue(status, [/service[_.]?role[_.]?key/i]);

  if (!url || !serviceRoleKey) {
    throw new Error(
      `Could not find API URL / service_role key in \`supabase status -o json\` output. Is the local stack running (\`bun run db:start\`)? Raw output:\n${raw}`
    );
  }
  return { url, serviceRoleKey };
}

async function main() {
  const { url, serviceRoleKey } = readLocalCredentials();
  log(`Using local Supabase stack at ${url}`);

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const suffix = Date.now().toString(36);
  const owners = [
    {
      email: `owner-a-${suffix}@pgtap-provisioning.test.local`,
      displayName: 'Provisioning Owner A'
    },
    {
      email: `owner-b-${suffix}@pgtap-provisioning.test.local`,
      displayName: 'Provisioning Owner B'
    }
  ];

  const provisioned: Array<{
    userId: string;
    email: string;
    profileId: string;
    businessId: string;
    businessSlug: string;
    publicWidgetId: string;
    widgetSettingsCount: number;
    knowledgeItemsCount: number;
  }> = [];

  for (const owner of owners) {
    log(`\nSigning up ${owner.email} via the real Auth Admin API...`);
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: owner.email,
      password: 'Pgtap-Provisioning-Test-1!',
      email_confirm: true,
      user_metadata: { display_name: owner.displayName }
    });
    check(
      'auth.admin.createUser() succeeds',
      !createError && !!created?.user,
      createError?.message ?? 'no user returned'
    );
    if (!created?.user) continue;
    const userId = created.user.id;

    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('id, display_name')
      .eq('id', userId);
    check(
      'exactly one profiles row',
      !profilesError && profiles?.length === 1,
      profilesError?.message ?? `got ${profiles?.length ?? 0} rows`
    );

    const { data: businesses, error: businessesError } = await admin
      .from('businesses')
      .select('id, owner_id, slug, public_widget_id')
      .eq('owner_id', userId);
    check(
      'exactly one businesses row',
      !businessesError && businesses?.length === 1,
      businessesError?.message ?? `got ${businesses?.length ?? 0} rows`
    );
    const business = businesses?.[0];
    check(
      'the business belongs to the correct profile (owner_id)',
      business?.owner_id === userId,
      `owner_id=${business?.owner_id}`
    );

    let widgetSettingsCount = 0;
    let knowledgeItemsCount = 0;
    if (business) {
      const { data: widgetSettings, error: widgetSettingsError } = await admin
        .from('widget_settings')
        .select('id')
        .eq('business_id', business.id);
      widgetSettingsCount = widgetSettings?.length ?? 0;
      check(
        'exactly one widget_settings row',
        !widgetSettingsError && widgetSettingsCount === 1,
        widgetSettingsError?.message ?? `got ${widgetSettingsCount} rows`
      );

      const { count: knowledgeCount, error: knowledgeError } = await admin
        .from('knowledge_items')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', business.id);
      knowledgeItemsCount = knowledgeCount ?? 0;
      check(
        'zero automatically seeded knowledge_items',
        !knowledgeError && knowledgeItemsCount === 0,
        knowledgeError?.message ?? `got ${knowledgeItemsCount} rows`
      );
    }

    provisioned.push({
      userId,
      email: owner.email,
      profileId: profiles?.[0]?.id ?? '',
      businessId: business?.id ?? '',
      businessSlug: business?.slug ?? '',
      publicWidgetId: business?.public_widget_id ?? '',
      widgetSettingsCount,
      knowledgeItemsCount
    });
  }

  if (provisioned.length === 2) {
    const [a, b] = provisioned;
    log('\nCross-checking the two provisioned owners...');
    check(
      'the two owners received different business ids',
      a.businessId !== b.businessId,
      `both got ${a.businessId}`
    );
    check(
      'the two owners received different slugs',
      a.businessSlug !== b.businessSlug,
      `both got ${a.businessSlug}`
    );
    check(
      'the two owners received different public_widget_ids',
      a.publicWidgetId !== b.publicWidgetId,
      `both got ${a.publicWidgetId}`
    );

    log('\nVerifying the single-business-per-owner rule is enforced...');
    const { error: dupError } = await admin.from('businesses').insert({
      owner_id: a.userId,
      name: 'Duplicate Business Attempt',
      slug: `duplicate-${a.userId}`,
      business_type: 'hotel',
      default_language: 'en',
      supported_languages: ['en']
    });
    check(
      'a second business insert for the same owner is rejected',
      !!dupError,
      'insert succeeded — businesses_owner_id_key did not reject a duplicate owner_id'
    );

    log('\nVerifying provisioning does not create duplicate rows for the same auth user...');
    const { data: profilesRecheck } = await admin.from('profiles').select('id').eq('id', a.userId);
    check(
      'still exactly one profiles row after the duplicate-business attempt',
      profilesRecheck?.length === 1,
      `got ${profilesRecheck?.length ?? 0}`
    );
  } else {
    failures.push({
      step: 'two owners provisioned',
      message: `only ${provisioned.length}/2 owners were successfully created`
    });
  }

  log(`\n${provisioned.length} owner(s) processed, ${failures.length} failure(s).`);
  if (failures.length > 0) {
    console.error('\nFAILURES:');
    for (const f of failures) console.error(`  - ${f.step}: ${f.message}`);
    process.exitCode = 1;
  } else {
    log('All provisioning assertions passed.');
  }
}

main().catch((error: unknown) => {
  console.error('Provisioning harness crashed:', error);
  process.exitCode = 1;
});
