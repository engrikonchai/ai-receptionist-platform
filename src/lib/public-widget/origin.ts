/**
 * Origin allow-listing for the public widget/chat proxy. An owner's
 * `allowed_origins` (public.widget_settings.allowed_origins, set from
 * the Widget dashboard page) are bare hostnames (e.g. "example.com" —
 * see the `TagsField` in widget-settings-form.tsx and the validation in
 * features/widget/schemas/widget.ts). A request's real `Origin` header
 * is a full origin (e.g. "https://example.com"); this compares the
 * header's hostname against the allow-list, never the other way
 * around — the header is the one thing a browser sets itself and a
 * caller can't spoof for a real cross-origin request.
 *
 * An empty allow-list always denies, by design — "never make the
 * widget public for every origin by default" (see the migration's own
 * header comment). There is no wildcard/"allow all" value this ever
 * accepts.
 */
export function isOriginAllowed(originHeader: string | null, allowedOrigins: string[]): boolean {
  if (!originHeader) return false;
  if (allowedOrigins.length === 0) return false;

  let hostname: string;
  try {
    hostname = new URL(originHeader).hostname.toLowerCase();
  } catch {
    return false;
  }

  const allowSet = new Set(allowedOrigins.map((o) => o.toLowerCase().split(':')[0]));
  return allowSet.has(hostname);
}

/**
 * CORS headers for a public-widget proxy response. Only ever echoes
 * back the exact origin that was already validated by
 * `isOriginAllowed()` — never `*`, and never called at all for a
 * request whose origin wasn't allowed.
 */
export function corsHeadersFor(originHeader: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': originHeader,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin'
  };
}
