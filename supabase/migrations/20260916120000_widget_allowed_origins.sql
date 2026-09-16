-- Widget: lets an owner restrict which website origins may embed their
-- public chat widget, and gives the new public widget/chat proxy
-- (src/app/api/public-widget/*) a safe, narrow surface to read the
-- fields it needs to validate a request — without ever using the
-- service-role key and without granting anon/public any access to the
-- underlying businesses/widget_settings tables themselves.
--
-- Additive and rerun-safe: adds exactly one nullable-default column
-- (guarded by `if not exists`) to the existing public.widget_settings
-- table, and one view (guarded by `create or replace`). Does not modify,
-- drop, or recreate any existing table, column, constraint, trigger,
-- function, or SELECT/UPDATE/DELETE policy, and does not touch any
-- other table. Safe to run more than once.
--
-- 1. allowed_origins: the website origins (scheme + host, e.g.
--    "https://example.com") this owner has allowed to embed their
--    widget. Defaults to an empty array — per the platform's security
--    requirement, an empty list means the widget is embeddable
--    *nowhere* (never "every origin by default"); the owner must add at
--    least one origin from the Widget dashboard page before the widget
--    will respond to any site. Existing rows (every business that
--    signed up before this migration) get this same safe default, so no
--    previously-configured widget suddenly becomes public everywhere.
alter table public.widget_settings
  add column if not exists allowed_origins text[] not null default '{}';

comment on column public.widget_settings.allowed_origins is
  'Website origins (scheme + host) allowed to embed this business''s public widget. Empty = embeddable nowhere yet; never treated as "allow all". Set from ai-receptionist-platform''s /dashboard/widget page.';

-- 2. widget_public_config: the one safe, narrow read surface the new
--    public widget/chat proxy uses to validate a request (widget id
--    exists, business + widget are enabled, calling origin is
--    allow-listed) before ever forwarding it to ChatbotDemo's own
--    /api/widget/* routes. Exposes only fields already meant to be
--    public-safe (the same fields ChatbotDemo's own widget session
--    response already returns to any visitor) — never business_id,
--    owner_id, handoff_email, leads, notes, or any other private
--    column.
--
--    Views run with the privileges of their owner (the role that runs
--    this migration) by default in Postgres, not the querying role's —
--    this is what lets `anon`/`authenticated` read through this view
--    even though they have no policy granting them anything on
--    businesses/widget_settings directly. This migration leaves that
--    default view-security mode alone (switching it to invoker-rights
--    would make it re-apply RLS for the querying role instead, which
--    has no policies here and would make the view return nothing) and
--    does not touch RLS or grants on the underlying tables at all —
--    anon/authenticated can only ever reach these specific columns,
--    only through this view.
create or replace view public.widget_public_config as
select
  b.public_widget_id,
  b.is_active as business_active,
  b.supported_languages,
  b.default_language,
  ws.title,
  ws.welcome_message_en,
  ws.welcome_message_me,
  ws.welcome_message_ru,
  ws.primary_color,
  ws.position,
  ws.mock_ai_enabled as widget_enabled,
  ws.human_handoff_enabled,
  ws.allowed_origins
from public.businesses b
join public.widget_settings ws on ws.business_id = b.id;

comment on view public.widget_public_config is
  'Public-safe subset of businesses + widget_settings for the widget/chat proxy (src/app/api/public-widget/*) to validate a request against — never exposes business_id, owner_id, handoff_email, or any other private column.';

grant select on public.widget_public_config to anon, authenticated;
