-- Widget: a dedicated widget_enabled toggle, an owner-configured
-- origin allow-list, and a SECURITY DEFINER function (never an
-- anon-granted view) as the one safe, narrow read surface the public
-- widget runtime (src/app/api/public-widget/*) uses to validate a
-- request and read display-safe config — without ever using the
-- service-role key for this specific lookup, and without ever letting
-- anon enumerate other businesses' widget configs.
--
-- This file replaces an earlier revision of this same migration
-- (never applied to any database — this whole feature is still
-- unmerged) that instead created a `widget_public_config` VIEW granted
-- SELECT to anon. That design had a real vulnerability: a view granted
-- to anon can be queried unfiltered (`select * from
-- widget_public_config`), letting any visitor list every business's
-- widget config, including its full `allowed_origins` list. A function
-- that requires a specific (widget id, origin) pair as arguments has no
-- equivalent "list everything" call, and only ever returns a row for a
-- request that already supplies a real widget id AND its own exact,
-- allow-listed origin.
--
-- Additive and rerun-safe: adds two nullable-default columns (guarded
-- by `if not exists`) to the existing public.widget_settings table,
-- drops the never-applied view, and creates one function (guarded by
-- `create or replace`). Does not modify, drop, or recreate any existing
-- table, column, constraint, trigger, or SELECT/UPDATE/DELETE policy,
-- and does not touch any other table. Safe to run more than once.

-- 1. widget_enabled: a dedicated on/off toggle for the public
--    embeddable widget, deliberately separate from
--    `mock_ai_enabled` (ChatbotDemo's own, unrelated single-tenant demo
--    toggle — conflating the two was a defect in the earlier revision
--    of this migration). Defaults to true, matching mock_ai_enabled's
--    own default: safe because `allowed_origins` below still defaults
--    to empty, so a freshly-created business's widget stays
--    unreachable from any real website until the owner explicitly
--    allow-lists a domain, regardless of this default.
alter table public.widget_settings
  add column if not exists widget_enabled boolean not null default true;

comment on column public.widget_settings.widget_enabled is
  'Dedicated on/off toggle for the public embeddable widget runtime (src/app/api/public-widget/*), independent of ChatbotDemo''s own mock_ai_enabled. Set from ai-receptionist-platform''s /dashboard/widget page.';

-- 2. allowed_origins: the website origins (scheme + hostname[:port],
--    e.g. "https://example.com") this owner has allowed to embed their
--    widget. Defaults to an empty array — an empty list means the
--    widget is embeddable *nowhere* (never "every origin by default");
--    the owner must add at least one origin from the Widget dashboard
--    page before the widget will respond to any site.
alter table public.widget_settings
  add column if not exists allowed_origins text[] not null default '{}';

comment on column public.widget_settings.allowed_origins is
  'Website origins (scheme + hostname[:port]) allowed to embed this business''s public widget. Normalized, exact-match only (see src/lib/public-widget/origin.ts) — no wildcards, no path, no credentials. Empty = embeddable nowhere yet; never treated as "allow all". Set from ai-receptionist-platform''s /dashboard/widget page.';

-- 3. Drop the earlier, never-applied, anon-enumerable view design.
drop view if exists public.widget_public_config;

-- 4. resolve_widget_config: the only way the public widget runtime
--    reads businesses/widget_settings without the service-role key.
--    SECURITY DEFINER + a fixed search_path means it runs with this
--    migration's own privileges (bypassing RLS on businesses/
--    widget_settings, which grant anon nothing directly) regardless of
--    the calling role's own search_path — every table reference inside
--    is also fully schema-qualified, so there is no ambiguity for a
--    hijacked search_path to exploit even without the `set` clause.
--
--    Returns zero rows (never an error, never a partial row) unless
--    the widget id is real AND its business is active AND the widget
--    itself is enabled AND the given origin is exactly on that
--    widget's allow-list. A caller can never distinguish "unknown
--    widget id" from "right id, wrong reason" from the response shape
--    alone — the same posture ChatbotDemo's own generic "Widget not
--    found" replies already use.
--
--    Never returns business_id, owner_id, allowed_origins, handoff
--    email, or any other private/internal column — only the display
--    fields the embeddable widget shell actually renders.
create or replace function public.resolve_widget_config(
  p_widget_id uuid,
  p_origin text
)
returns table (
  title text,
  welcome_message_en text,
  welcome_message_me text,
  welcome_message_ru text,
  primary_color text,
  "position" text,
  human_handoff_enabled boolean,
  default_language text,
  supported_languages text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ws.title,
    ws.welcome_message_en,
    ws.welcome_message_me,
    ws.welcome_message_ru,
    ws.primary_color,
    ws.position,
    ws.human_handoff_enabled,
    b.default_language,
    b.supported_languages
  from public.businesses b
  join public.widget_settings ws on ws.business_id = b.id
  where b.public_widget_id = p_widget_id
    and b.is_active = true
    and ws.widget_enabled = true
    and p_origin is not null
    and p_origin = any (ws.allowed_origins)
$$;

comment on function public.resolve_widget_config(uuid, text) is
  'Public-safe widget display-config lookup for the embeddable widget (src/app/api/public-widget/config). Returns zero rows unless the widget exists, its business is active, the widget itself is enabled, and the given origin is exactly allow-listed. Never returns business_id, owner_id, allowed_origins, or handoff_email. Requires both arguments on every call — there is no way to list or enumerate other widgets through this function.';

-- 5. Grants: every new Postgres function is executable by PUBLIC by
--    default — revoke that first, then grant execute only to the two
--    roles that actually need it (a signed-out visitor calls this as
--    anon; a signed-in owner's own live preview, if it ever calls this
--    same function client-side, calls it as authenticated). No other
--    role gets this by default, now or if one is added later.
revoke all on function public.resolve_widget_config(uuid, text) from public;
grant execute on function public.resolve_widget_config(uuid, text) to anon, authenticated;
