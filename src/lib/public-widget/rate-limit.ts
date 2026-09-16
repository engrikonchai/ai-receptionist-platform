/**
 * Best-effort, in-memory rate limiting for the public widget runtime —
 * defense-in-depth only, NOT a production-safe durable limiter.
 *
 * KNOWN LIMITATION, matching ChatbotDemo's own lib/server/rate-limit.ts:
 * this state lives in the Node process's memory. On any platform that
 * runs more than one server instance (Vercel's own serverless/edge
 * deployment model included — each concurrent invocation can be a
 * distinct, short-lived instance with its own memory), a request stream
 * is spread across instances that each keep their own independent
 * counters. The effective limit becomes "N requests per window, per
 * instance" rather than a hard global cap, and a burst spread across
 * enough concurrent instances can exceed the intended limit by a large
 * factor. A determined abuser can trivially exceed the nominal limit.
 *
 * This module is included as one real layer of abuse protection (it
 * does help against a single misbehaving client hitting a single warm
 * instance repeatedly) and is explicitly NOT sufficient on its own.
 * Treat the absence of a durable, cross-instance store (Redis/Upstash or
 * equivalent) as a release blocker for this feature — see the shipped
 * report for this branch.
 */

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

const MAX_BUCKETS = 50_000;

function prune(now: number, windowMs: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart >= windowMs) buckets.delete(key);
  }
}

/**
 * Fixed-window limiter. Returns `true` when the call is allowed (and
 * counts it), `false` when the key is already over `limit` for the
 * current window. `key` should combine the widget id with the best
 * available per-client signal (IP, falling back to visitor id) — see
 * callers in runtime.ts.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  prune(now, windowMs);

  const existing = buckets.get(key);
  if (!existing || now - existing.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (existing.count >= limit) return false;
  existing.count += 1;
  return true;
}

/** Best-effort client IP from standard proxy headers — never trusted for anything beyond rate-limit bucketing. */
export function clientIpFrom(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0]?.trim() || 'unknown';
  return request.headers.get('x-real-ip') ?? 'unknown';
}

export const SESSION_RATE_LIMIT = { limit: 20, windowMs: 60_000 };
export const MESSAGE_RATE_LIMIT = { limit: 30, windowMs: 60_000 };

export const RATE_LIMIT_EXCEEDED_MESSAGE = 'Too many requests. Please try again shortly.';
