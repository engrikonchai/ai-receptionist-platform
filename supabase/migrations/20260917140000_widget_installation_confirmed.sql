-- Widget: an explicit "installation acknowledged/tested" signal for the
-- setup checklist (src/app/dashboard/overview), distinct from every
-- other checklist item.
--
-- Every other checklist item (business profile, knowledge base, widget
-- configured, allowed origin) is derived from data that already exists
-- for an independent reason (the owner set a business name, added a
-- knowledge item, configured the widget, allow-listed a domain) — none
-- of those need a new column, per this migration's own restraint
-- elsewhere in the schema. "Installed and tested" has no such
-- independent fact to derive from: the platform's server has no way to
-- observe that a third-party page actually mounted the widget-loader
-- script successfully (that would require the loader to phone home
-- extra telemetry on every page load across every embedding site,
-- which is exactly the kind of new tracking/analytics machinery this
-- feature set is deliberately not adding yet). The only honest signal
-- available is the owner's own attestation — "I copied the snippet,
-- installed it, and checked it works" — set by an explicit action (a
-- button in the onboarding flow and on /dashboard/widget), not
-- inferred from anything else already in the row.
--
-- Same boolean-plus-timestamp shape as the existing
-- profiles.onboarding_completed / onboarding_completed_at pair (see
-- supabase/migrations/20260915000100_platform_onboarding.sql) for the
-- same reason: the boolean is what the checklist and any future query
-- filters on cheaply, the timestamp is supplementary "when" metadata
-- for support/debugging, and a single nullable timestamp would make
-- callers use `is not null` everywhere instead of a plain boolean.
--
-- Additive and rerun-safe: only adds two nullable-default columns to
-- the existing public.widget_settings table, guarded by `if not
-- exists`. Does not modify, drop, or recreate any existing table,
-- column, policy, trigger, or function. Safe to run more than once.
--
-- RLS: no new policy is added or needed. The existing
-- "widget_settings_update_own" policy (see
-- supabase/migrations/20260915193000_repair_live_rls_policies.sql)
-- already applies to the whole widget_settings row, these two new
-- columns included, so a signed-in owner can already set their own
-- widget's installation_confirmed / installation_confirmed_at exactly
-- as the onboarding flow and Widget dashboard page need — the same
-- reasoning the platform_onboarding migration used for
-- profiles_update_own.
--
-- NOT YET EXECUTED. To apply: run this file against the shared
-- Supabase project (same project ai-receptionist-platform and
-- ChatbotDemo both use) via the Supabase SQL editor, `supabase db
-- push`, or your usual migration runner. See this branch's PR report
-- for the exact instructions.

alter table public.widget_settings
  add column if not exists installation_confirmed boolean not null default false;

alter table public.widget_settings
  add column if not exists installation_confirmed_at timestamptz;

comment on column public.widget_settings.installation_confirmed is
  'Set true once the owner confirms they installed and tested the embeddable widget on their own website (see src/features/widget/components/install-snippet-card.tsx). An owner attestation, not a derived fact — the server has no way to observe a third-party page mounting the loader script.';
comment on column public.widget_settings.installation_confirmed_at is
  'Timestamp of the installation_confirmed transition to true; null until then.';
