import { fetchWidgetPublicConfig } from '@/lib/public-widget/config';
import { handlePreflight, publicWidgetJson } from '@/lib/public-widget/http';
import { corsHeadersFor } from '@/lib/public-widget/origin';

/**
 * Public, unauthenticated, read-only endpoint — the cosmetic/display
 * config (enabled state, assistant name, colour, launcher position, and
 * whether human hand-off is offered) the embeddable widget loader
 * (public/widget-loader.js) needs before a visitor ever opens the chat.
 * Backed entirely by `public.resolve_widget_config` (a SECURITY DEFINER
 * function, not an anon-granted table/view — see
 * supabase/migrations/20260916120000_widget_allowed_origins.sql), read
 * through the anon key.
 *
 * An unknown widget id, a disabled widget or business, and a request
 * from a non-allow-listed origin all produce the exact same
 * `{ enabled: false }` response — by design, so this endpoint gives a
 * prober no signal about which of those three is true, and can never be
 * used to enumerate other businesses' widget configuration.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const publicWidgetId = url.searchParams.get('widgetId');
  const originHeader = request.headers.get('origin');
  const headers = originHeader ? corsHeadersFor(originHeader) : undefined;

  if (!publicWidgetId) {
    return publicWidgetJson(400, { error: 'Missing widgetId.' }, headers);
  }

  const config = await fetchWidgetPublicConfig(publicWidgetId, originHeader);
  if (!config) {
    return publicWidgetJson(200, { enabled: false }, headers);
  }

  return publicWidgetJson(
    200,
    {
      enabled: true,
      title: config.title,
      primaryColor: config.primary_color,
      position: config.position,
      humanHandoffEnabled: config.human_handoff_enabled,
      defaultLanguage: config.default_language,
      supportedLanguages: config.supported_languages
    },
    headers
  );
}

export async function OPTIONS(request: Request) {
  return handlePreflight(request);
}
