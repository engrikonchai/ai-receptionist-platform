/**
 * Origin normalization and allow-list matching for the public widget
 * runtime. `public.widget_settings.allowed_origins` stores fully
 * normalized origins (`scheme://hostname[:port]`, e.g.
 * "https://example.com") — the same canonical format both the
 * dashboard save path (features/widget/schemas/widget.ts) and this
 * module produce, so the SQL side (resolve_widget_config's
 * `p_origin = any (ws.allowed_origins)`) can do a plain exact-string
 * match with no per-call normalization logic duplicated in SQL.
 *
 * `normalizeOrigin()` is the single source of truth for what counts as
 * a valid origin anywhere in this app — accepts a bare hostname
 * (defaults to https://) or a full "scheme://host[:port]" string,
 * rejects paths, query strings, fragments, embedded credentials,
 * wildcards, and any scheme other than http/https. It does not attempt
 * full IDN-homograph detection (e.g. Cyrillic look-alike characters):
 * `URL` itself converts non-ASCII hostnames to their Punycode form
 * ("xn--..."), so a look-alike domain always normalizes to a distinct
 * string from the real one it imitates — but an owner can still be
 * tricked into allow-listing a convincing fake by hand. That's a
 * user-education problem, not something string normalization alone can
 * close.
 */
const HOSTNAME_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function isValidHostname(hostname: string): boolean {
  if (hostname === 'localhost') return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true;
  if (!hostname.includes('.')) return false;
  return hostname.split('.').every((label) => HOSTNAME_LABEL_PATTERN.test(label));
}

export function normalizeOrigin(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.includes('*')) return null;

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.search || url.hash) return null;
  if (url.pathname !== '/' && url.pathname !== '') return null;

  const hostname = url.hostname.toLowerCase();
  if (!isValidHostname(hostname)) return null;

  const port = url.port ? `:${url.port}` : '';
  return `${url.protocol}//${hostname}${port}`;
}

/**
 * True only when `originHeader` (a request's real `Origin` header — the
 * one thing a genuine cross-origin browser request sets itself and a
 * caller can't spoof) normalizes to a value present, verbatim, in
 * `allowedOrigins`. An empty allow-list always denies — "never make the
 * widget public for every origin by default." There is no
 * wildcard/"allow all" value this ever accepts.
 */
export function isOriginAllowed(originHeader: string | null, allowedOrigins: string[]): boolean {
  if (!originHeader) return false;
  if (allowedOrigins.length === 0) return false;

  const normalized = normalizeOrigin(originHeader);
  if (!normalized) return false;

  return allowedOrigins.includes(normalized);
}

/**
 * CORS headers for a public-widget response. Only ever echoes back the
 * exact, unmodified origin header that was already validated by
 * `isOriginAllowed()` — never `*`, and never called for a request whose
 * origin wasn't allowed.
 */
export function corsHeadersFor(originHeader: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': originHeader,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin'
  };
}
