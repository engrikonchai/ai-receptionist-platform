import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed, expiring widget session tokens — the actual conversation
 * authorization boundary for the public widget runtime.
 *
 * `business_id` agreement alone was never enough: any two requests that
 * agreed on `publicWidgetId` + `conversationId` (both of which a
 * browser supplies) could resolve to the same business and read/write
 * the same conversation, regardless of which visitor actually owns it.
 * This token is how the server proves a specific (widget, conversation,
 * visitor) tuple was legitimately issued by `startOrContinueSession()`
 * — a caller can present matching request fields, but without this
 * HMAC they cannot fabricate a token the server will accept, so a
 * guessed or leaked conversation id alone is never sufficient.
 *
 * This is a signed token, not an encrypted one — HMAC-SHA256 proves
 * the payload wasn't modified after issuance, it does not hide the
 * payload's contents from anyone who base64url-decodes it (which is a
 * trivial, reversible encoding, not encryption). That is exactly why
 * `businessId` is NEVER included in this payload: unlike
 * `publicWidgetId`/`conversationId`/`visitorId` (all of which the
 * browser already knows — it sent them itself), `businessId` is
 * server-internal and must never be readable by the browser, decoded
 * token or not. Every caller (runtime.ts) re-resolves `businessId`
 * itself from `publicWidgetId` on every request instead, and uses that
 * freshly resolved value — never a value carried in the token — to
 * scope every conversation read/write.
 */

const WIDGET_SESSION_TOKEN_TTL_SECONDS = 4 * 60 * 60; // 4 hours — generous for one chat session.

export type WidgetSessionTokenClaims = {
  publicWidgetId: string;
  conversationId: string;
  visitorId: string;
};

type SignedPayload = WidgetSessionTokenClaims & { iat: number; exp: number };

function sign(secret: string, payloadB64: string): Buffer {
  return createHmac('sha256', secret).update(payloadB64).digest();
}

/** Lets a caller fail closed before doing any other work (e.g. before writing a conversation row) when signing isn't possible, rather than discovering it only after `issueWidgetSessionToken()` returns `null`. */
export function isWidgetSessionSigningConfigured(): boolean {
  return Boolean(process.env.WIDGET_SESSION_SECRET);
}

/** Returns `null` when `WIDGET_SESSION_SECRET` isn't configured — callers must fail closed, never issue an unsigned/unverifiable token. */
export function issueWidgetSessionToken(claims: WidgetSessionTokenClaims): string | null {
  const secret = process.env.WIDGET_SESSION_SECRET;
  if (!secret) return null;

  const now = Math.floor(Date.now() / 1000);
  const payload: SignedPayload = {
    ...claims,
    iat: now,
    exp: now + WIDGET_SESSION_TOKEN_TTL_SECONDS
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signatureB64 = sign(secret, payloadB64).toString('base64url');
  return `${payloadB64}.${signatureB64}`;
}

/**
 * Verifies signature and expiry only — the caller (runtime.ts) is
 * still responsible for cross-checking every returned claim against
 * the current request's own fields before trusting it for anything.
 * Never logs the token or any claim. Returns `null` for anything
 * invalid, expired, modified, or malformed — deliberately without
 * distinguishing which, so a caller can't use this to probe.
 */
export function verifyWidgetSessionToken(
  token: string | null | undefined
): WidgetSessionTokenClaims | null {
  const secret = process.env.WIDGET_SESSION_SECRET;
  if (!secret || !token) return null;

  const dotIndex = token.indexOf('.');
  if (dotIndex <= 0 || dotIndex === token.length - 1) return null;

  const payloadB64 = token.slice(0, dotIndex);
  const signatureB64 = token.slice(dotIndex + 1);

  let providedSignature: Buffer;
  try {
    providedSignature = Buffer.from(signatureB64, 'base64url');
  } catch {
    return null;
  }

  const expectedSignature = sign(secret, payloadB64);

  // A length mismatch is checked before the timing-safe comparison —
  // timingSafeEqual throws on unequal-length buffers, and the length
  // of a well-formed signature is fixed by the hash algorithm, not by
  // anything secret, so this check itself leaks nothing useful.
  if (providedSignature.length !== expectedSignature.length) return null;
  if (!timingSafeEqual(providedSignature, expectedSignature)) return null;

  let payload: SignedPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (
    typeof payload.exp !== 'number' ||
    typeof payload.iat !== 'number' ||
    typeof payload.publicWidgetId !== 'string' ||
    typeof payload.conversationId !== 'string' ||
    typeof payload.visitorId !== 'string'
  ) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (now >= payload.exp) return null;

  return {
    publicWidgetId: payload.publicWidgetId,
    conversationId: payload.conversationId,
    visitorId: payload.visitorId
  };
}
