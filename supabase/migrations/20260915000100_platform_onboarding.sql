-- Platform onboarding: tracks whether a business owner has completed the
-- ai-receptionist-platform post-signup onboarding flow (business details,
-- location/languages, customer handoff), which replaces the visible
-- "Adria Stay Budva" placeholder data ChatbotDemo's onboarding trigger
-- seeds by default — without changing the business's id, slug, or
-- public_widget_id, so ChatbotDemo's own resolution of those stays intact.
--
-- Additive and rerun-safe: only adds two nullable-default columns to the
-- existing public.profiles table, guarded by `if not exists`. Does not
-- modify, drop, or recreate any existing table, column, policy, trigger,
-- or function. Safe to run more than once.
--
-- RLS: no new policy is added or needed. The existing
-- "profiles_update_own" policy (see ChatbotDemo's
-- supabase/migrations/20260201000200_row_level_security.sql —
-- `for update using (id = auth.uid()) with check (id = auth.uid())`)
-- already applies to the whole profiles row, these two new columns
-- included, so a signed-in owner can already update their own
-- onboarding_completed/onboarding_completed_at exactly as the platform's
-- onboarding flow needs.

alter table public.profiles
  add column if not exists onboarding_completed boolean not null default false;

alter table public.profiles
  add column if not exists onboarding_completed_at timestamptz;

comment on column public.profiles.onboarding_completed is
  'Set true by ai-receptionist-platform once the owner has completed the post-signup business-setup flow (see src/app/onboarding).';
comment on column public.profiles.onboarding_completed_at is
  'Timestamp of the onboarding_completed transition to true; null until then.';
