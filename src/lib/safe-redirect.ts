/**
 * Shared "only ever redirect inside this app" guard, used by proxy.ts,
 * the login/signup pages, and /auth/callback. A `next` value only ever
 * comes from a query string an attacker can fully control, so it must
 * never be trusted as an absolute or protocol-relative URL — a browser
 * still treats `//evil.example` (and the `/\evil.example` backslash
 * variant some browsers normalize the same way) as external.
 */

export const DEFAULT_REDIRECT_PATH = '/dashboard/overview';

export function isSafeInternalPath(path: string | null | undefined): path is string {
  if (!path) return false;
  if (!path.startsWith('/')) return false;
  if (path.startsWith('//')) return false;
  if (path.startsWith('/\\')) return false;
  if (path.includes('://')) return false;
  return true;
}

/** Returns `next` if it's a safe internal path, otherwise `fallback`. */
export function resolveSafeNextPath(
  next: string | null | undefined,
  fallback: string = DEFAULT_REDIRECT_PATH
): string {
  return isSafeInternalPath(next) ? next : fallback;
}
