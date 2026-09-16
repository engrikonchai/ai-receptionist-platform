import { fetchWidgetPublicConfig } from './config';
import { CHAT_RUNTIME_MISSING_MESSAGE, getChatRuntimeOrigin, isChatRuntimeConfigured } from './env';
import { corsHeadersFor, isOriginAllowed } from './origin';

function json(status: number, body: unknown, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers });
}

/**
 * The shared shape both `/api/public-widget/session` and
 * `/api/public-widget/message` follow:
 *
 *   1. Validate the request body's `publicWidgetId` is a real, known
 *      widget (via the safe, anon-readable `widget_public_config` view
 *      — never the service-role key).
 *   2. Validate the calling browser's `Origin` header against that
 *      widget's `allowed_origins`. An unlisted or missing origin is
 *      always rejected — there is no "allow all" fallback.
 *   3. If the widget or its business is disabled, respond
 *      `{ enabled: false }` (matching ChatbotDemo's own contract)
 *      without ever reaching the upstream runtime.
 *   4. Otherwise, forward the exact same request body to ChatbotDemo's
 *      real `/api/widget/*` route (server-to-server — never exposed to
 *      the browser) and relay its response verbatim, with this
 *      response's own CORS headers attached so the calling browser can
 *      actually read it.
 *
 * `publicWidgetId` is read directly off the parsed, already-validated
 * body (both request schemas require it) — never trusted from
 * anywhere else, and re-verified against the database on every call,
 * exactly like every other public/authenticated boundary in this app.
 */
export async function proxyToChatRuntime(params: {
  request: Request;
  upstreamPath: '/api/widget/session' | '/api/widget/message';
  body: { publicWidgetId: string } & Record<string, unknown>;
}): Promise<Response> {
  const { request, upstreamPath, body } = params;
  const originHeader = request.headers.get('origin');

  const config = await fetchWidgetPublicConfig(body.publicWidgetId);
  if (!config) {
    // No CORS headers here on purpose — an unknown widget id gets no
    // signal about whether *any* origin could ever read more than a
    // generic 404, matching ChatbotDemo's own "can't tell wrong id from
    // disabled business" posture.
    return json(404, { error: 'Widget not found.' });
  }

  const headers = originHeader ? corsHeadersFor(originHeader) : undefined;

  if (!isOriginAllowed(originHeader, config.allowed_origins)) {
    return json(403, { error: 'This widget is not enabled for this website.' }, headers);
  }

  if (!config.business_active || !config.widget_enabled) {
    return json(200, { enabled: false }, headers);
  }

  if (!isChatRuntimeConfigured()) {
    return json(503, { error: CHAT_RUNTIME_MISSING_MESSAGE }, headers);
  }

  try {
    const upstream = await fetch(`${getChatRuntimeOrigin()}${upstreamPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await upstream.json().catch(() => ({}));
    return json(upstream.status, data, headers);
  } catch {
    return json(502, { error: CHAT_RUNTIME_MISSING_MESSAGE }, headers);
  }
}

/** Shared OPTIONS preflight handler — see proxyToChatRuntime's doc comment for why this can be permissive: it carries no data, real enforcement happens on the POST. */
export function handlePreflight(request: Request): Response {
  const originHeader = request.headers.get('origin');
  if (!originHeader) return new Response(null, { status: 204 });
  return new Response(null, { status: 204, headers: corsHeadersFor(originHeader) });
}

export { json as publicWidgetJson };
