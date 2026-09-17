-- Stripe billing foundation v1 (src/features/billing/) — one Stripe
-- Checkout subscription per business, synchronized through verified
-- webhooks. This migration adds two new, private tables and touches
-- nothing else: no existing table, column, constraint, trigger, or
-- policy is modified, dropped, or recreated. Safe to run more than
-- once (every `create` below is guarded).
--
-- NOT executed as part of this branch — see the PR/report for the
-- manual Supabase Dashboard steps and exact run order relative to the
-- application deploy.

-- ---------------------------------------------------------------------
-- 1. business_subscriptions — one row per business's Stripe
--    subscription lifecycle. `business_id` is `unique`, not just
--    indexed: this v1 billing model supports exactly one active
--    subscription per business, never two rows racing to represent it.
--    `stripe_customer_id`/`stripe_subscription_id` are also unique so a
--    webhook can never accidentally attach one Stripe object to two
--    different businesses' rows.
--
--    `status` mirrors Stripe's own subscription status values exactly
--    (see https://stripe.com/docs/api/subscriptions/object#subscription_object-status)
--    rather than inventing a parallel vocabulary the webhook handler
--    would have to translate — the same "read the authoritative Stripe
--    value" philosophy already used for Stripe amounts/currency
--    (src/features/billing/api/service.ts never hardcodes a price).
--
--    No row here is ever deleted by application code, including on
--    cancellation — `status` moves to 'canceled' and the row's history
--    (trial dates, period dates, `canceled_at`) is kept. Only a
--    cascading business deletion removes a row, and this app has no
--    business-deletion feature today.
-- ---------------------------------------------------------------------
create table if not exists public.business_subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  status text not null default 'incomplete',
  trial_start timestamptz,
  trial_end timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_subscriptions_status_check check (
    status in (
      'incomplete',
      'incomplete_expired',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'paused'
    )
  )
);

comment on table public.business_subscriptions is
  'One row per business''s Stripe subscription lifecycle (src/features/billing/). status mirrors Stripe''s own subscription status values verbatim. Written only by the service-role key, from the verified Stripe webhook handler (src/app/api/stripe/webhook/route.ts) and the checkout/portal server actions'' own customer-id backfill — never directly by a dashboard request. Row is never deleted on cancellation; status moves to ''canceled'' and history is kept.';

-- Row Level Security: owners get read-only access to their own
-- business's row; nothing else. Reuses the same "join through
-- businesses.owner_id" shape as every other owner-scoped table in this
-- app (see supabase/migrations/20260915193000_repair_live_rls_policies.sql).
-- Deliberately NO insert/update/delete policy for `authenticated` —
-- every write to this table goes through the service-role key (which
-- bypasses RLS regardless of policies), exactly the same posture
-- `handoffs` already uses for its own INSERT (see that migration's own
-- comments): a signed-in owner can see their subscription state but can
-- never fabricate or edit it from the browser.
alter table public.business_subscriptions enable row level security;

revoke all on public.business_subscriptions from public, anon;
grant select on public.business_subscriptions to authenticated;
grant select, insert, update, delete on public.business_subscriptions to service_role;

drop policy if exists "business_subscriptions_select_own" on public.business_subscriptions;

create policy "business_subscriptions_select_own"
  on public.business_subscriptions
  for select
  to authenticated
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.businesses b
      where b.id = business_subscriptions.business_id
        and b.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- 2. stripe_webhook_events — idempotency ledger for the webhook
--    handler. `stripe_event_id` is the primary key (Stripe's own
--    globally-unique event id, e.g. "evt_..."), so a second delivery of
--    the same event — Stripe retries on anything but a 2xx, and can
--    also simply deliver a duplicate — is rejected by the database
--    itself as a primary-key conflict, not by an application-level
--    check that could race under concurrent delivery. `attempt_count`
--    and `last_error` are optional, safe (no payload/secret contents)
--    diagnostics for a processing failure — never populated with
--    request bodies, customer data, or Stripe secrets.
--
--    No policy is created — RLS is enabled with zero grants to
--    anon/authenticated, the same default-deny posture
--    widget_rate_limits already uses (see
--    supabase/migrations/20260916130000_widget_rate_limits.sql): only
--    the service-role key, which bypasses RLS entirely, can read or
--    write this table.
-- ---------------------------------------------------------------------
create table if not exists public.stripe_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now(),
  attempt_count integer not null default 1,
  last_error text
);

comment on table public.stripe_webhook_events is
  'Idempotency ledger for the Stripe webhook handler (src/app/api/stripe/webhook/route.ts) — one row per successfully processed Stripe event id. Read and written only by the service-role key; RLS is enabled with no policies, so anon/authenticated get nothing. last_error, when present, is a short, safe diagnostic string only — never a request body, customer field, or secret.';

alter table public.stripe_webhook_events enable row level security;

revoke all on public.stripe_webhook_events from public, anon, authenticated;
grant select, insert, update, delete on public.stripe_webhook_events to service_role;
