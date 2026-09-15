/**
 * The app's own canonical public URL — used to build absolute links
 * that leave this process (e.g. the Supabase `emailRedirectTo` sent in
 * a confirmation email), where a relative path or the current request's
 * host can't be relied on. Works in both server and browser code (no
 * `next/headers`, just `process.env` reads of NEXT_PUBLIC_* variables,
 * which Next.js inlines into the client bundle at build time).
 *
 * Priority:
 *   1. NEXT_PUBLIC_SITE_URL — set this explicitly in production.
 *   2. NEXT_PUBLIC_VERCEL_URL — Vercel's own `VERCEL_URL` is a plain
 *      (non-public) env var with no protocol, so `next.config.ts`
 *      re-exposes it under this NEXT_PUBLIC_ name for the client too.
 *   3. http://localhost:3000 — local development fallback.
 */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return stripTrailingSlash(explicit);

  const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL;
  if (vercelUrl) return stripTrailingSlash(withProtocol(vercelUrl));

  return 'http://localhost:3000';
}

function withProtocol(url: string): string {
  return /^https?:\/\//.test(url) ? url : `https://${url}`;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
