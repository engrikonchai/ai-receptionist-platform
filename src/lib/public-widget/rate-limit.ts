import { createHmac } from 'node:crypto';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

/**
 * Durable, atomic rate limiting for the public widget runtime, backed
 * by `public.widget_rate_limits` and `public.check_and_increment_rate_limit`
 * (see supabase/migrations/20260916130000_widget_rate_limits.sql) —
 * counting happens in Postgres via a single atomic upsert statement,
 * so it stays correct across however many concurrent serverless
 * instances are handling traffic at once. No in-process state lives in
 * this module; every call is a round trip to the durable store.
 *
 * Fails closed: if the hash secret or service-role key isn't
 * configured, or the database call itself fails, this reports
 * `'unavailable'` — callers must respond 503, not let the request
 * through unchecked. An unreachable limiter is exactly the scenario
 * this exists to guard against (unmetered AI/runtime cost), so silently
 * allowing traffic through on failure would defeat the entire point.
 */

export type RateLimitRoute = 'config' | 'session' | 'message' | 'handoff';

export const RATE_LIMITS: Record<RateLimitRoute, { limit: number; windowSeconds: number }> = {
  config: { limit: 30, windowSeconds: 60 },
  session: { limit: 10, windowSeconds: 60 },
  message: { limit: 20, windowSeconds: 60 },
  // A deliberate, one-off visitor action (not a per-keystroke or
  // per-turn call like 'message') — a genuine visitor never submits
  // this more than once or twice per session. Tighter than 'session'
  // (10/60s) since there is no legitimate reason for a real visitor to
  // approach even that: 5/60s comfortably covers a mis-click + retry
  // without leaving meaningful headroom for automated abuse (each
  // allowed request can write a lead + handoff row and an
  // acknowledgement message).
  handoff: { limit: 5, windowSeconds: 60 }
};

export type RateLimitOutcome =
  | { status: 'allowed' }
  | { status: 'limited'; retryAfterSeconds: number }
  | { status: 'unavailable' };

export const RATE_LIMIT_EXCEEDED_MESSAGE = 'Too many requests. Please try again shortly.';
export const RATE_LIMIT_UNAVAILABLE_MESSAGE =
  "The chat assistant isn't available right now. Please try again shortly.";

/**
 * The best available per-client signal for bucketing, never stored
 * raw — only hashed into a bucket key (see `buildBucketKey`). Prefers
 * `x-vercel-forwarded-for`: on Vercel's platform this header is set by
 * Vercel's own edge network from the real client connection and can't
 * be forged by the request itself, unlike a client-supplied
 * `X-Forwarded-For` value. Falls back to the standard
 * `x-forwarded-for` / `x-real-ip` headers for non-Vercel deployments —
 * on a self-hosted deployment behind your own reverse proxy, these are
 * only as trustworthy as that proxy; make sure it sets (and strips any
 * client-supplied copy of) whichever header you rely on. With neither
 * header present, every such request shares one bucket per
 * route+widget — a stricter effective limit for that traffic, never a
 * bypass.
 */
export function clientIpFrom(request: Request): string {
  const vercelForwardedFor = request.headers.get('x-vercel-forwarded-for');
  if (vercelForwardedFor) return vercelForwardedFor.split(',')[0]?.trim() || 'unknown';

  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0]?.trim() || 'unknown';

  return request.headers.get('x-real-ip') ?? 'unknown';
}

/** HMAC-SHA256 over `route:publicWidgetId:clientIp` — the only form a client IP ever takes once it reaches storage. Returns `null` when `RATE_LIMIT_HASH_SECRET` isn't configured. */
function buildBucketKey(
  route: RateLimitRoute,
  publicWidgetId: string,
  clientIp: string
): string | null {
  const secret = process.env.RATE_LIMIT_HASH_SECRET;
  if (!secret) return null;

  return createHmac('sha256', secret)
    .update(`${route}:${publicWidgetId}:${clientIp}`)
    .digest('hex');
}

type RateLimitRpcRow = { allowed: boolean; retry_after_seconds: number };

export async function checkRateLimit(
  route: RateLimitRoute,
  publicWidgetId: string,
  request: Request
): Promise<RateLimitOutcome> {
  const bucketKey = buildBucketKey(route, publicWidgetId, clientIpFrom(request));
  if (!bucketKey) {
    console.error(
      '[public-widget] rate limit unavailable: RATE_LIMIT_HASH_SECRET is not configured'
    );
    return { status: 'unavailable' };
  }

  // `createSupabaseServiceRoleClient()` and the RPC call below are
  // expected to report failure through a returned `{ error }` value,
  // never by throwing — but a malformed env var (e.g. a
  // NEXT_PUBLIC_SUPABASE_URL that isn't a valid URL) makes the
  // underlying client constructor throw synchronously, and a genuine
  // network failure can reject the RPC call outright. Either would
  // otherwise propagate as an uncaught exception out of this route,
  // producing a bare framework 500 with none of the CORS headers a
  // deliberate 503 response carries — which looks identical to a
  // silent widget failure on the embedding site. This try/catch is
  // what keeps "the limiter is unreachable" always resolving to the
  // same deterministic, CORS-safe `unavailable` outcome documented
  // above, regardless of which specific way it's unreachable.
  try {
    const supabase = createSupabaseServiceRoleClient();
    if (!supabase) {
      console.error(
        '[public-widget] rate limit unavailable: service-role Supabase client could not be created (check NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)'
      );
      return { status: 'unavailable' };
    }

    const { limit, windowSeconds } = RATE_LIMITS[route];

    const { data, error } = await supabase
      .rpc('check_and_increment_rate_limit', {
        p_bucket_key: bucketKey,
        p_limit: limit,
        p_window_seconds: windowSeconds
      })
      .single();

    if (error || !data) {
      console.error(
        '[public-widget] rate limit unavailable: check_and_increment_rate_limit RPC failed',
        error?.message ?? 'no data returned'
      );
      return { status: 'unavailable' };
    }

    const row = data as RateLimitRpcRow;
    if (!row.allowed) return { status: 'limited', retryAfterSeconds: row.retry_after_seconds };
    return { status: 'allowed' };
  } catch (caught) {
    console.error(
      '[public-widget] rate limit unavailable: unexpected exception',
      caught instanceof Error ? caught.message : caught
    );
    return { status: 'unavailable' };
  }
}
