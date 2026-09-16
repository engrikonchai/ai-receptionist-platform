-- Durable, atomic rate limiting for the public widget runtime
-- (src/lib/public-widget/rate-limit.ts), replacing the earlier
-- in-memory limiter — which was explicitly documented as non-durable
-- and unsafe across multiple concurrent serverless instances. This
-- migration adds a private bucket table plus one atomic upsert
-- function; no new paid infrastructure (Redis/Upstash/etc.) is used —
-- only the Postgres database this app already has through Supabase.
--
-- Additive and rerun-safe: creates one new table (guarded by `if not
-- exists`) and two functions (guarded by `create or replace`). Does
-- not modify, drop, or recreate any existing table, column,
-- constraint, trigger, or policy, and does not touch any other table.
-- Safe to run more than once.

-- 1. widget_rate_limits: one row per rate-limit bucket. `bucket_key`
--    is an HMAC-SHA256 hex digest (see
--    src/lib/public-widget/rate-limit.ts's buildBucketKey) over
--    "route:publicWidgetId:clientIp" — the raw client IP address is
--    never stored, only this keyed, salted hash of it. A fixed-window
--    counter: `count` requests seen since `window_start`, reset once
--    the configured window has elapsed (see
--    check_and_increment_rate_limit below).
create table if not exists public.widget_rate_limits (
  bucket_key text primary key,
  count integer not null default 0,
  window_start timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.widget_rate_limits is
  'Durable rate-limit buckets for the public widget runtime (src/lib/public-widget/rate-limit.ts). bucket_key is an HMAC-SHA256 hash — never a raw IP address. Read and written only by the service-role key, through check_and_increment_rate_limit() below; RLS is enabled with no policies, so anon/authenticated get nothing.';

-- Row Level Security, enabled with zero policies: the default-deny
-- posture this app uses everywhere a table must never be reachable
-- from the browser. The trusted widget runtime reads/writes this
-- table exclusively through the service-role key, which bypasses RLS
-- entirely regardless of policies — this table needs no policies of
-- its own to grant that access, and having none means no browser
-- session (anon or a signed-in owner's authenticated session) can
-- select, insert, update, or delete a single row here.
alter table public.widget_rate_limits enable row level security;

-- Defense in depth beyond RLS: some Supabase projects configure
-- default privileges that grant table access to anon/authenticated on
-- every newly created table in the public schema. Revoke explicitly so
-- this table's access never depends on that project-level default, and
-- grant only to the one role that should ever touch it.
revoke all on public.widget_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.widget_rate_limits to service_role;

-- 2. check_and_increment_rate_limit: the one atomic operation the
--    widget runtime calls on every rate-limited request. A single
--    `insert ... on conflict (bucket_key) do update ... returning`
--    statement is how this stays correct under concurrency — Postgres
--    resolves a conflicting concurrent insert by taking a row lock on
--    the existing row before applying the `do update`, so two
--    concurrent Vercel instances calling this for the same bucket_key
--    at the same moment are serialized by the database itself, not by
--    any in-process state. Neither instance can observe or apply a
--    stale count — there is no read-then-write race window for either
--    to exploit.
--
--    Fixed-window semantics: if the current time is still inside the
--    bucket's window, increments `count`; if the window has elapsed,
--    resets `count` to 1 and starts a new window from now. Returns
--    whether this call was within `p_limit` for its window, and (when
--    it was not) how many seconds remain until the window resets, for
--    a `Retry-After` response header.
create or replace function public.check_and_increment_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  retry_after_seconds integer
)
language sql
security definer
set search_path = public
as $$
  with upserted as (
    insert into public.widget_rate_limits (bucket_key, count, window_start, updated_at)
    values (p_bucket_key, 1, now(), now())
    on conflict (bucket_key) do update
      set count = case
            when now() - public.widget_rate_limits.window_start
                 >= make_interval(secs => p_window_seconds)
            then 1
            else public.widget_rate_limits.count + 1
          end,
          window_start = case
            when now() - public.widget_rate_limits.window_start
                 >= make_interval(secs => p_window_seconds)
            then now()
            else public.widget_rate_limits.window_start
          end,
          updated_at = now()
    returning count, window_start
  )
  select
    upserted.count <= p_limit,
    greatest(
      0,
      ceil(extract(epoch from (upserted.window_start + make_interval(secs => p_window_seconds) - now())))::integer
    )
  from upserted
$$;

comment on function public.check_and_increment_rate_limit(text, integer, integer) is
  'Atomic fixed-window rate-limit check-and-increment for the public widget runtime. Single upsert statement — safe under concurrent callers across multiple server instances. Never called with a raw IP address; p_bucket_key is always a pre-hashed value (see src/lib/public-widget/rate-limit.ts). SECURITY DEFINER only so it can run regardless of the caller''s own search_path; the table it touches still allows nothing to anon/authenticated on its own.';

revoke all on function public.check_and_increment_rate_limit(text, integer, integer) from public;
grant execute on function public.check_and_increment_rate_limit(text, integer, integer) to service_role;

-- 3. cleanup_expired_widget_rate_limits: without this, one row
--    accumulates per distinct (route, widget, hashed IP) combination
--    forever. A fixed-window bucket is only ever meaningful for
--    `p_window_seconds` after its last update, so any row not updated
--    in the last `p_max_age_seconds` is safe to delete — it holds no
--    remaining limiting effect. Not scheduled by this migration itself
--    (this project has no confirmed pg_cron/Vercel Cron setup to hook
--    into safely from a SQL migration); see this branch's PR report
--    for how to invoke it periodically.
create or replace function public.cleanup_expired_widget_rate_limits(
  p_max_age_seconds integer default 3600
)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.widget_rate_limits
  where updated_at < now() - make_interval(secs => p_max_age_seconds);
$$;

comment on function public.cleanup_expired_widget_rate_limits(integer) is
  'Deletes widget_rate_limits rows whose window is long past (default: not updated in the last hour). Run periodically (see the PR report for scheduling options) — not scheduled by this migration.';

revoke all on function public.cleanup_expired_widget_rate_limits(integer) from public;
grant execute on function public.cleanup_expired_widget_rate_limits(integer) to service_role;
