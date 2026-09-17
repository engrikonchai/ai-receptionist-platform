-- Paddle Billing foundation (src/features/billing/, src/lib/paddle/) — one
-- Paddle subscription per business, synchronized through verified
-- webhooks, using Paddle SANDBOX for testing.
--
-- Fully additive and rerun-safe: every `create table`/`create index`/
-- `create or replace function` is idempotent, and every grant is
-- preceded by an explicit `revoke all` so a repeat run always converges
-- on the exact same, minimal privilege set. NOT executed as part of
-- this branch — see the PR/report for the manual Supabase Dashboard
-- steps and exact run order relative to the application deploy.

-- ---------------------------------------------------------------------
-- 1. business_subscriptions — one row per business's Paddle
--    subscription lifecycle. `business_id` is `unique`: this v1 billing
--    model supports exactly one active subscription per business, never
--    two rows racing to represent it. `paddle_customer_id`/
--    `paddle_subscription_id` are also unique so a webhook can never
--    accidentally attach one Paddle object to two different businesses'
--    rows.
--
--    `status` mirrors Paddle's own subscription status vocabulary
--    verbatim (see https://developer.paddle.com/api-reference/subscriptions/subscription-object) —
--    a subscription only ever exists once its first transaction has
--    actually progressed — rather than inventing a parallel vocabulary
--    the webhook handler would have to translate.
--
--    `paddle_subscription_created_at` (Paddle's own subscription
--    `created_at`) is a second-precision FALLBACK ordering key, used by
--    `sync_business_subscription` only when neither side of a
--    comparison has a `billing_generation` (see below) — never rely on
--    lexical id comparison, and prefer a strictly monotonic key over a
--    timestamp wherever possible.
--
--    `billing_generation` is a strictly monotonic integer copied from
--    the `billing_checkout_attempts` row (see its own `generation`
--    identity column) that produced the subscription — embedded as
--    trusted, server-set Paddle `custom_data` at transaction creation
--    (src/features/billing/api/service.ts) and read back by the webhook
--    handler (src/lib/paddle/sync.ts). No two attempts ever share a
--    generation, giving deterministic ordering even for two
--    subscriptions created in the same second.
--
--    `paddle_event_occurred_at` is Paddle's own webhook event
--    `occurred_at` timestamp — Paddle explicitly does not guarantee
--    in-order webhook delivery, even for events about the SAME
--    subscription. This column lets `sync_business_subscription` refuse
--    to let a delayed, out-of-order event for the CURRENT subscription
--    overwrite a state a later-occurring event already applied — a
--    concern `billing_generation` alone does not cover, since that only
--    orders DIFFERENT subscriptions against each other, not two events
--    about the same one.
--
--    `trial_used_at` is an immutable, once-set marker: the first time
--    this business's row is synchronized from a Paddle subscription
--    that actually entered a trial (an item with `trial_dates`
--    present), it is set and never cleared or overwritten again — by
--    any later sync, any duplicate delivery, any resubscribe, any
--    subscription-id change, and even a stale/older subscription event
--    that the ordering guard otherwise correctly refuses to let replace
--    the current subscription's state. See `sync_business_subscription`'s
--    own two-statement design below.
--
--    Trial eligibility itself is decided entirely by Paddle (configured
--    on the Price in the Paddle Dashboard, per-customer) — this app
--    never requests or withholds a trial at transaction-creation time.
--    This column is this app's own durable record of what happened,
--    for display and audit — never a lever this app pulls.
--
--    `has_paddle_customer` is a generated, stored boolean — the only
--    customer-related fact `authenticated` is allowed to read (see the
--    grant below). It lets the billing page show a "Manage billing"
--    action without ever exposing the real Paddle customer id to a
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
  paddle_customer_id text unique,
  paddle_subscription_id text unique,
  paddle_transaction_id text,
  paddle_subscription_created_at timestamptz,
  paddle_event_occurred_at timestamptz,
  billing_generation bigint,
  paddle_price_id text,
  status text not null default 'trialing',
  trial_start timestamptz,
  trial_end timestamptz,
  trial_used_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  has_paddle_customer boolean generated always as (paddle_customer_id is not null) stored,
  constraint business_subscriptions_status_check check (
    status in ('trialing', 'active', 'past_due', 'paused', 'canceled')
  )
);

comment on table public.business_subscriptions is
  'One row per business''s Paddle subscription lifecycle (src/features/billing/). status mirrors Paddle''s own subscription status values verbatim. Written only by the service-role key: the verified Paddle webhook handler (src/app/api/paddle/webhook/route.ts) via the sync_business_subscription() function, and the checkout/portal server actions'' own service-role reads/writes (src/features/billing/api/service.ts) — never directly by a dashboard request, and never via an authenticated client''s plain table write. Row is never deleted on cancellation; status moves to ''canceled'' and history is kept. paddle_customer_id/paddle_subscription_id/paddle_transaction_id are never selectable by `authenticated` — see the column-level grant below.';

-- Row Level Security: owners get read-only access to their own
-- business's row, and only the columns explicitly granted below — RLS
-- restricts *rows*, not *columns*, so the column-level GRANT is what
-- actually keeps the Paddle identifiers out of reach of a directly-
-- authenticated Supabase REST call, regardless of what this app's own
-- server code does. Reuses the same "join through businesses.owner_id"
-- shape as every other owner-scoped table in this app (see
-- supabase/migrations/20260915193000_repair_live_rls_policies.sql).
-- Deliberately NO insert/update/delete policy for `authenticated` —
-- every write to this table goes through the service-role key (which
-- bypasses RLS regardless of policies): a signed-in owner can see their
-- subscription state but can never fabricate or edit it from the
-- browser.
alter table public.business_subscriptions enable row level security;

-- Revoke everything, including `authenticated`, before granting the
-- narrow column-level SELECT below, so a rerun always converges on the
-- exact, minimal privilege set regardless of anything broader that may
-- already exist.
revoke all on public.business_subscriptions from public, anon, authenticated;

-- Column-level SELECT grant for `authenticated` — deliberately excludes
-- paddle_customer_id, paddle_subscription_id, paddle_transaction_id,
-- paddle_subscription_created_at, paddle_event_occurred_at, and
-- billing_generation (all Paddle-internal or ordering-only, never
-- needed by an owner-facing screen). A REST query against this table
-- with `select=*` or naming any of those columns fails with a
-- permission error for `authenticated`, full stop — it is not merely
-- filtered out by RLS, the role has no privilege on those columns at
-- all. `has_paddle_customer` (a derived boolean, never the real id) is
-- what src/features/billing/api/service.ts's fetchBillingStatus()
-- actually reads for the "Manage billing" action's visibility.
grant select (
  id,
  business_id,
  paddle_price_id,
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
  has_paddle_customer
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
--    (src/lib/paddle/sync.ts calls this via the service-role client;
--    application code never issues a plain `.upsert()` against this
--    table itself).
--
--    Two statements, both executed inside the single transaction this
--    function call runs in — atomic as a whole, but deliberately NOT a
--    single `do update` for both concerns, because they have different
--    guards:
--
--    Statement 1 — trial usage, recorded independently of subscription
--    ordering. A stale, older, already-superseded subscription event
--    that genuinely had a real trial must still permanently mark this
--    business as trial-used, even though its subscription *state* is
--    too old to replace the current row.
--
--    Statement 2 — the subscription row itself, via
--    `insert ... on conflict (business_id) do update ... where <ordering guard>`.
--    The guard applies the update when either:
--      - the stored row has no subscription id yet (first sync ever for
--        this business), or
--      - this is the SAME subscription (by id) already on file AND the
--        incoming event's `occurred_at` is the same age or newer than
--        the last event that updated this row (Paddle does not
--        guarantee in-order webhook delivery, even for the same
--        subscription — this is the guard against THAT), or
--      - the incoming `billing_generation` is known and is strictly
--        greater than the one on file (or the one on file is unknown) —
--        the primary cross-subscription ordering mechanism, or
--      - (fallback, only when NEITHER side has a `billing_generation`)
--        the incoming subscription's `created_at` is the same age or
--        newer.
--    A delayed webhook that fails every branch of that guard matches
--    zero rows on the `do update` — a safe, successful no-op, not an
--    error.
--
--    Plain SECURITY INVOKER (the default) is correct and sufficient
--    here — only `service_role` may ever execute this function (see
--    the grant below), and `service_role` already bypasses RLS/column
--    grants entirely.
-- ---------------------------------------------------------------------
create or replace function public.sync_business_subscription(
  p_business_id uuid,
  p_paddle_customer_id text,
  p_paddle_subscription_id text,
  p_paddle_subscription_created_at timestamptz,
  p_paddle_event_occurred_at timestamptz,
  p_billing_generation bigint,
  p_paddle_price_id text,
  p_paddle_transaction_id text,
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
  update public.business_subscriptions
  set trial_used_at = now(), updated_at = now()
  where business_id = p_business_id
    and trial_used_at is null
    and p_trial_start is not null;

  insert into public.business_subscriptions (
    business_id,
    paddle_customer_id,
    paddle_subscription_id,
    paddle_transaction_id,
    paddle_subscription_created_at,
    paddle_event_occurred_at,
    billing_generation,
    paddle_price_id,
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
    p_paddle_customer_id,
    p_paddle_subscription_id,
    p_paddle_transaction_id,
    p_paddle_subscription_created_at,
    p_paddle_event_occurred_at,
    p_billing_generation,
    p_paddle_price_id,
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
    paddle_customer_id = excluded.paddle_customer_id,
    paddle_subscription_id = excluded.paddle_subscription_id,
    paddle_transaction_id = coalesce(excluded.paddle_transaction_id, business_subscriptions.paddle_transaction_id),
    paddle_subscription_created_at = excluded.paddle_subscription_created_at,
    paddle_event_occurred_at = excluded.paddle_event_occurred_at,
    billing_generation = excluded.billing_generation,
    paddle_price_id = excluded.paddle_price_id,
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
    business_subscriptions.paddle_subscription_id is null
    or (
      business_subscriptions.paddle_subscription_id = excluded.paddle_subscription_id
      and (
        business_subscriptions.paddle_event_occurred_at is null
        or excluded.paddle_event_occurred_at is null
        or excluded.paddle_event_occurred_at >= business_subscriptions.paddle_event_occurred_at
      )
    )
    or (
      excluded.billing_generation is not null
      and (
        business_subscriptions.billing_generation is null
        or excluded.billing_generation > business_subscriptions.billing_generation
      )
    )
    or (
      excluded.billing_generation is null
      and business_subscriptions.billing_generation is null
      and (
        business_subscriptions.paddle_subscription_created_at is null
        or excluded.paddle_subscription_created_at is null
        or excluded.paddle_subscription_created_at >= business_subscriptions.paddle_subscription_created_at
      )
    );
$$;

revoke all on function public.sync_business_subscription(
  uuid, text, text, timestamptz, timestamptz, bigint, text, text, text, timestamptz, timestamptz, timestamptz, timestamptz, boolean, timestamptz
) from public, anon, authenticated;

grant execute on function public.sync_business_subscription(
  uuid, text, text, timestamptz, timestamptz, bigint, text, text, text, timestamptz, timestamptz, timestamptz, timestamptz, boolean, timestamptz
) to service_role;

-- ---------------------------------------------------------------------
-- 3. billing_checkout_attempts — durable Checkout-creation concurrency
--    safety. Closes the race between "check business_subscriptions" and
--    "the webhook writes a row": two simultaneous or retried
--    startCheckout() calls for the same business must converge on
--    exactly one Paddle transaction/subscription.
--
--    `billing_checkout_attempts_one_pending_per_business` is a unique
--    partial index — the actual atomic constraint. Postgres allows at
--    most one row per `business_id` with `status = 'pending'` at any
--    time; a second concurrent INSERT attempt fails with a unique-
--    violation (`23505`) at the database level, not an application-
--    level race.
--
--    The Paddle Node SDK's `transactions.create()` has no request-level
--    idempotency-key parameter at all — so a losing/mid-flight caller
--    that finds a pending attempt with no `paddle_transaction_id`
--    recorded yet can NEVER safely "resume" by calling
--    `transactions.create()` again (that would risk creating a genuine
--    second Paddle transaction). See
--    src/features/billing/api/checkout-attempts.ts's own doc comment:
--    only the winning claimer may ever create a transaction; every
--    other caller either reuses an already-recorded, still-open
--    transaction id, or is told to retry shortly.
--
--    `generation` is a strictly monotonic identity column — the durable
--    ordering key embedded into Paddle transaction/subscription
--    `custom_data` at Checkout creation and copied onto
--    `business_subscriptions.billing_generation` by
--    `sync_business_subscription` above.
--
--    `expires_at` is a best-effort LOCAL staleness bound only — Paddle
--    transactions have no provider-enforced expiry of their own, so
--    this never gates anything by itself; a
--    stuck attempt is only ever cleared after confirming via the Paddle
--    API that its recorded transaction is genuinely dead (`canceled`),
--    the same "trust provider state over the local clock" principle
--    used throughout this billing feature.
--
--    Entirely private: RLS is enabled with zero policies and every
--    grant to anon/authenticated is revoked, the same default-deny
--    posture as paddle_webhook_events below. Only the service-role key
--    may read or write this table.
-- ---------------------------------------------------------------------
create table if not exists public.billing_checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  generation bigint generated always as identity,
  status text not null default 'pending',
  paddle_transaction_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '31 minutes'),
  constraint billing_checkout_attempts_status_check check (
    status in ('pending', 'completed', 'expired', 'abandoned')
  )
);

create unique index if not exists billing_checkout_attempts_one_pending_per_business
  on public.billing_checkout_attempts (business_id)
  where (status = 'pending');

comment on table public.billing_checkout_attempts is
  'Durable Checkout-creation concurrency safety (src/features/billing/api/checkout-attempts.ts) — at most one "pending" row per business, enforced by billing_checkout_attempts_one_pending_per_business. generation is a strictly monotonic ordering key embedded into Paddle custom_data and copied onto business_subscriptions.billing_generation. Read and written only by the service-role key, always after verifyActiveBusiness(); RLS is enabled with no policies, so anon/authenticated get nothing.';

alter table public.billing_checkout_attempts enable row level security;

revoke all on public.billing_checkout_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.billing_checkout_attempts to service_role;

-- ---------------------------------------------------------------------
-- 4. paddle_webhook_events — idempotency ledger for the webhook
--    handler. `paddle_event_id` is the primary key (Paddle's own
--    globally-unique event id, e.g. "evt_..."), so a second delivery of
--    the same event — Paddle retries on anything but a 2xx, and can
--    also simply deliver a duplicate — is rejected by the database
--    itself as a primary-key conflict, not by an application-level
--    check that could race under concurrent delivery. `attempt_count`
--    and `last_error` are optional, safe (no payload/secret contents)
--    diagnostics for a processing failure — never populated with
--    request bodies, customer data, or Paddle secrets.
--
--    No policy is created — RLS is enabled with zero grants to
--    anon/authenticated, the same default-deny posture
--    widget_rate_limits already uses (see
--    supabase/migrations/20260916120000_widget_rate_limits.sql): only
--    the service-role key, which bypasses RLS entirely, can read or
--    write this table.
-- ---------------------------------------------------------------------
create table if not exists public.paddle_webhook_events (
  paddle_event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now(),
  attempt_count integer not null default 1,
  last_error text
);

comment on table public.paddle_webhook_events is
  'Idempotency ledger for the Paddle webhook handler (src/app/api/paddle/webhook/route.ts) — one row per successfully processed Paddle event id, written only after processing succeeds (a failed attempt writes no row, so Paddle''s own retry reprocesses it). Read and written only by the service-role key; RLS is enabled with no policies, so anon/authenticated get nothing. last_error, when present, is a short, safe diagnostic string only — never a request body, customer field, or secret.';

alter table public.paddle_webhook_events enable row level security;

revoke all on public.paddle_webhook_events from public, anon, authenticated;
grant select, insert, update, delete on public.paddle_webhook_events to service_role;
