#!/usr/bin/env bash
# Full local/CI database verification — a true clean rebuild from zero,
# proving a completely blank Supabase project can apply every migration
# in this repository, provision a new owner, enforce RLS, and support
# service-role-only operations. Everything here runs against an
# ephemeral local Supabase Docker stack (`bun run db:start`) — never
# production. Requires Docker; see README.md.
#
# Sequence (see this repo's own database-CI milestone report for why):
#   1. Start local Supabase.
#   2. Reset (apply every migration to a blank database) — run 1.
#   3. Run the real pgTAP database tests.
#   4. Run the signup/provisioning integration harness.
#   5. Reset again from zero — run 2, proving reproducibility (this is a
#      second, independent rebuild, never "apply the same migrations
#      twice to one schema").
#   6. Re-run at least the schema/provisioning smoke tests against that
#      rebuilt database.
#   7. Always stop the local stack, even if an earlier step failed.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

cleanup() {
  echo "==> Stopping local Supabase (cleanup)..."
  bunx supabase stop --no-backup || true
}
trap cleanup EXIT

echo "==> Starting local Supabase..."
bunx supabase start

echo "==> Resetting the local database — run 1 (fresh migration chain, from zero)..."
bunx supabase db reset --local

echo "==> Running pgTAP database tests..."
bunx supabase test db --local

echo "==> Running the signup/provisioning integration harness..."
bun run supabase/tests-integration/provisioning.ts

echo "==> Resetting the local database — run 2 (independent rebuild, reproducibility)..."
bunx supabase db reset --local

echo "==> Re-running the schema/provisioning smoke tests against the rebuilt database..."
bunx supabase test db --local supabase/tests/00_schema_contract_test.sql
bun run supabase/tests-integration/provisioning.ts

echo "==> Database verification complete."
