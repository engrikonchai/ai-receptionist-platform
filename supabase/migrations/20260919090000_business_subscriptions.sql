-- Stripe billing foundation v1 (src/features/billing/) — one Stripe
-- Checkout subscription per business, synchronized through verified
-- webhooks.
--
-- v1.1 correction pass: closes six release-blocking gaps found in
-- security audit before this migration was ever executed — column-level
-- exposure of Stripe identifiers to `authenticated`, a Checkout-creation
-- race, stale-webhook subscription ordering, and durable one-trial-per-
-- business state. See src/app/api/stripe/webhook/route.ts,
-- src/lib/stripe/sync.ts, and src/features/billing/api/service.ts for
-- the application-side half of each fix.
--
-- Still additive and still rerun-safe end to end: every `create table`/
-- `create index`/`create or replace function` is idempotent, every
-- `alter table ... add column` uses `if not exists`, and every grant is
-- a plain re-statement of the same privilege (a repeat run changes
-- nothing). Nothing pre-existing outside these tables is touched. NOT
-- executed as part of this branch — see the PR/report for the manual
-- Supabase Dashboard steps and exact run order relative to the
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
--    `stripe_subscription_created_at` is Stripe's own `subscription.created`
--    timestamp — the durable ordering key that lets a single atomic
--    upsert (see `sync_business_subscription` below) refuse to let a
--    stale, delayed webhook from an OLD subscription overwrite a
--    NEWER one a business created after canceling.
--
--    `trial_used_at` is an immutable, once-set marker: the first time
--    this business's row is synchronized from a Stripe subscription
--    that actually entered a trial (`trial_start` present), it is set
--    and never cleared or overwritten again — by any later sync, any
--    duplicate delivery, any resubscribe, any subscription-id change.
--    Enforced atomically in `sync_business_subscription` via
--    `coalesce(business_subscriptions.trial_used_at, excluded.trial_used_at)`,
--    never by a separate read-then-write in application code.
--
--    `has_stripe_customer` is a generated, stored boolean — the only
--    customer-related fact `authenticated` is allowed to read (see the
--    grant below). It lets the billing page show a "Manage billing"
--    action without ever exposing the real Stripe customer id to a
--    dashboard-scoped query.
--
--    No row here is ever deleted by application code, including on
--    cancellation — `status` moves to 'canceled' and the row's history
--    (trial dates, period dates, `canceled_at`, `trial_used_at`) is
--    kept. Only a cascading business deletion removes a row, and this
--    app has no business-deletion feature today.
-- ---------------------------------------------------------------------
create table if not exists public.business_subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_subscription_created_at timestamptz,
  stripe_price_id text,
  status text not null default 'incomplete',
  trial_start timestamptz,
  trial_end timestamptz,
  trial_used_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  has_stripe_customer boolean generated always as (stripe_customer_id is not null) stored,
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

-- Additive, idempotent column adds for anyone who ran the pre-correction
-- v1 shape of this migration in a scratch/local environment before this
-- pass landed — a no-op against a fresh database that only ever sees
-- this corrected file.
alter table public.business_subscriptions
  add column if not exists stripe_subscription_created_at timestamptz;
alter table public.business_subscriptions
  add column if not exists trial_used_at timestamptz;

comment on table public.business_subscriptions is
  'One row per business''s Stripe subscription lifecycle (src/features/billing/). status mirrors Stripe''s own subscription status values verbatim. Written only by the service-role key: the verified Stripe webhook handler (src/app/api/stripe/webhook/route.ts) via the sync_business_subscription() function, and the checkout/portal server actions'' own service-role reads/writes (src/features/billing/api/service.ts) — never directly by a dashboard request, and never via an authenticated client''s plain table write. Row is never deleted on cancellation; status moves to ''canceled'' and history is kept. stripe_customer_id/stripe_subscription_id are never selectable by `authenticated` — see the column-level grant below.';

-- Row Level Security: owners get read-only access to their own
-- business's row, and only the columns explicitly granted below —
-- RLS restricts *rows*, not *columns*, so the column-level GRANT is
-- what actually keeps stripe_customer_id/stripe_subscription_id out of
-- reach of a directly-authenticated Supabase REST call, regardless of
-- what this app's own server code does. Reuses the same "join through
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

-- Column-level SELECT grant for `authenticated` — deliberately excludes
-- stripe_customer_id, stripe_subscription_id, and
-- stripe_subscription_created_at (Stripe-internal, not needed by any
-- owner-facing screen). A REST query against this table with
-- `select=*` or naming any of those three columns fails with a
-- permission error for `authenticated`, full stop — it is not merely
-- filtered out by RLS, the role has no privilege on those columns at
-- all. `has_stripe_customer` (a derived boolean, never the real id) is
-- what src/features/billing/api/service.ts's fetchBillingStatus()
-- actually reads for the "Manage billing" action's visibility.
grant select (
  id,
  business_id,
  stripe_price_id,
  status,
  trial_start,
  trial_end,
  trial_used_at,
  current_period_start,
  current_period_end,
  cancel_at_period_end,
  canceled_at,
  created_at,
  updated_at,
  has_stripe_customer
) on public.business_subscriptions to authenticated;

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
-- 2. sync_business_subscription — the one, atomic write path for
--    business_subscriptions from the webhook handler
--    (src/lib/stripe/sync.ts calls this via the service-role client;
--    application code never issues a plain `.upsert()` against this
--    table itself). A single `insert ... on conflict (business_id) do
--    update ... where <ordering guard>` statement, so the "is this
--    subscription current?" comparison happens inside one Postgres
--    statement — never a non-atomic read in JS, then a separate write.
--
--    The `where` guard only lets the update apply when either:
--      - this is the SAME subscription (by id) already on file — a
--        normal in-place status/period update always applies, or
--      - the stored row has no subscription id or no created-at yet
--        (first sync ever for this business), or
--      - the incoming subscription's `created` timestamp is the same
--        age or newer than the one on file.
--    A delayed webhook from an OLDER, since-superseded subscription
--    (created before the one currently on file) fails that guard, so
--    the `do update` clause matches zero rows — a safe, successful
--    no-op, not an error.
--
--    `trial_used_at` is coalesced, never overwritten once set — the
--    durable one-trial-per-business guarantee. It only becomes
--    non-null the first time a subscription with a real `trial_start`
--    is synchronized, and nothing after that can ever clear or replace
--    it, including a resubscribe under a brand-new subscription id.
--
--    Plain SECURITY INVOKER (the default) is correct and sufficient
--    here — only `service_role` may ever execute this function (see
--    the grant below), and `service_role` already bypasses RLS/column
--    grants entirely, so there is no need to elevate privileges via
--    SECURITY DEFINER.
-- ---------------------------------------------------------------------
create or replace function public.sync_business_subscription(
  p_business_id uuid,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_stripe_subscription_created_at timestamptz,
  p_stripe_price_id text,
  p_status text,
  p_trial_start timestamptz,
  p_trial_end timestamptz,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_canceled_at timestamptz
)
returns void
language sql
as $$
  insert into public.business_subscriptions (
    business_id,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_subscription_created_at,
    stripe_price_id,
    status,
    trial_start,
    trial_end,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    canceled_at,
    trial_used_at,
    created_at,
    updated_at
  )
  values (
    p_business_id,
    p_stripe_customer_id,
    p_stripe_subscription_id,
    p_stripe_subscription_created_at,
    p_stripe_price_id,
    p_status,
    p_trial_start,
    p_trial_end,
    p_current_period_start,
    p_current_period_end,
    p_cancel_at_period_end,
    p_canceled_at,
    case when p_trial_start is not null then now() else null end,
    now(),
    now()
  )
  on conflict (business_id) do update set
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    stripe_subscription_created_at = excluded.stripe_subscription_created_at,
    stripe_price_id = excluded.stripe_price_id,
    status = excluded.status,
    trial_start = excluded.trial_start,
    trial_end = excluded.trial_end,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    canceled_at = excluded.canceled_at,
    trial_used_at = coalesce(business_subscriptions.trial_used_at, excluded.trial_used_at),
    updated_at = now()
  where
    business_subscriptions.stripe_subscription_id is null
    or business_subscriptions.stripe_subscription_id = excluded.stripe_subscription_id
    or business_subscriptions.stripe_subscription_created_at is null
    or excluded.stripe_subscription_created_at is null
    or excluded.stripe_subscription_created_at >= business_subscriptions.stripe_subscription_created_at;
$$;

revoke all on function public.sync_business_subscription(
  uuid, text, text, timestamptz, text, text, timestamptz, timestamptz, timestamptz, timestamptz, boolean, timestamptz
) from public, anon, authenticated;

grant execute on function public.sync_business_subscription(
  uuid, text, text, timestamptz, text, text, timestamptz, timestamptz, timestamptz, timestamptz, boolean, timestamptz
) to service_role;

-- ---------------------------------------------------------------------
-- 3. billing_checkout_attempts — durable Checkout-creation idempotency.
--    Closes the race between "check business_subscriptions" and "the
--    webhook writes a row": two simultaneous or retried startCheckout()
--    calls for the same business must converge on exactly one Stripe
--    Checkout Session, one Stripe customer, one subscription.
--
--    `billing_checkout_attempts_one_pending_per_business` is a unique
--    partial index — the actual atomic constraint. Postgres allows at
--    most one row per `business_id` with `status = 'pending'` at any
--    time; a second concurrent INSERT attempt fails with a unique-
--    violation (`23505`) at the database level, not an application-
--    level race. The server-generated `id` of the row that DID win the
--    insert is what src/features/billing/api/service.ts uses as
--    Stripe's own idempotency key for `checkout.sessions.create`, and
--    `stripe_checkout_session_id` is filled in once that call returns
--    — a loser of the race reads this same row back and reuses its
--    Checkout Session instead of creating a second one.
--
--    `expires_at` bounds how long a claimed-but-abandoned attempt (the
--    owner closed the tab before Stripe redirected them anywhere) can
--    block a fresh attempt — a new startCheckout() call expires any
--    stale pending row for the business before trying to claim its own.
--
--    Entirely private: RLS is enabled with zero policies and every
--    grant to anon/authenticated is revoked, the same default-deny
--    posture as stripe_webhook_events below. Only the service-role key
--    may read or write this table.
-- ---------------------------------------------------------------------
create table if not exists public.billing_checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  status text not null default 'pending',
  stripe_checkout_session_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  constraint billing_checkout_attempts_status_check check (
    status in ('pending', 'completed', 'expired', 'abandoned')
  )
);

create unique index if not exists billing_checkout_attempts_one_pending_per_business
  on public.billing_checkout_attempts (business_id)
  where (status = 'pending');

comment on table public.billing_checkout_attempts is
  'Durable idempotency for Stripe Checkout Session creation (src/features/billing/api/checkout-attempts.ts) — at most one "pending" row per business, enforced by billing_checkout_attempts_one_pending_per_business. Read and written only by the service-role key, always after verifyActiveBusiness(); RLS is enabled with no policies, so anon/authenticated get nothing.';

alter table public.billing_checkout_attempts enable row level security;

revoke all on public.billing_checkout_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.billing_checkout_attempts to service_role;

-- ---------------------------------------------------------------------
-- 4. stripe_webhook_events — idempotency ledger for the webhook
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
  'Idempotency ledger for the Stripe webhook handler (src/app/api/stripe/webhook/route.ts) — one row per successfully processed Stripe event id, written only after processing succeeds (a failed attempt writes no row, so Stripe''s own retry reprocesses it). Read and written only by the service-role key; RLS is enabled with no policies, so anon/authenticated get nothing. last_error, when present, is a short, safe diagnostic string only — never a request body, customer field, or secret.';

alter table public.stripe_webhook_events enable row level security;

revoke all on public.stripe_webhook_events from public, anon, authenticated;
grant select, insert, update, delete on public.stripe_webhook_events to service_role;
