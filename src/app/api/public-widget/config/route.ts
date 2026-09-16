import { fetchWidgetPublicConfig } from '@/lib/public-widget/config';
import { corsHeadersFor, isOriginAllowed } from '@/lib/public-widget/origin';
import { handlePreflight, publicWidgetJson } from '@/lib/public-widget/proxy';

/**
 * Public, unauthenticated, read-only endpoint — the cosmetic/display
 * config (enabled state, assistant name, colour, launcher position, and
 * whether human hand-off is offered) the embeddable widget shell
 * (src/app/widget/[publicWidgetId]) needs before a visitor ever opens
 * the chat and a real session gets created. Same origin allow-list
 * enforcement as the session/message proxies — see
 * src/lib/public-widget/proxy.ts's doc comment — but this one never
 * forwards anything to the upstream chat runtime; it only ever reads
 * `public.widget_public_config` via the anon key.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const publicWidgetId = url.searchParams.get('widgetId');
  if (!publicWidgetId) {
    return publicWidgetJson(400, { error: 'Missing widgetId.' });
  }

  const originHeader = request.headers.get('origin');
  const config = await fetchWidgetPublicConfig(publicWidgetId);
  if (!config) {
    return publicWidgetJson(404, { error: 'Widget not found.' });
  }

  const headers = originHeader ? corsHeadersFor(originHeader) : undefined;

  if (!isOriginAllowed(originHeader, config.allowed_origins)) {
    return publicWidgetJson(
      403,
      { error: 'This widget is not enabled for this website.' },
      headers
    );
  }

  return publicWidgetJson(
    200,
    {
      enabled: config.business_active && config.widget_enabled,
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
