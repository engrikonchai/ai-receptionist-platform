/**
 * Safe, server-side classification and logging for a failed
 * `paddle.webhooks.unmarshal()` call in
 * src/app/api/paddle/webhook/route.ts. That route deliberately returns
 * the exact same generic `400 "Invalid signature."` response for every
 * failure mode below — an attacker (or Paddle itself) must never be
 * able to tell from the HTTP response alone whether a delivery was
 * rejected for a stale timestamp vs. a wrong secret vs. a malformed
 * header. This module exists only to make the SAME failure legible
 * from server-side logs, without changing that response or the
 * underlying verification/replay-protection logic at all — the real
 * accept/reject decision is made entirely by the installed
 * `@paddle/paddle-node-sdk`'s own `unmarshal()` call; nothing here
 * participates in that decision.
 *
 * The classification below is derived directly from reading the
 * installed SDK's actual source — never guessed:
 *
 *   node_modules/@paddle/paddle-node-sdk/dist/cjs/notifications/helpers/webhooks.js
 *     `unmarshal()` either returns the parsed event, or throws. It can
 *     throw for exactly three reasons:
 *       1. `isValidSignature()` (below) throws — a malformed
 *          `Paddle-Signature` header — propagates unchanged.
 *       2. `isValidSignature()` resolves `false` — `unmarshal()` itself
 *          then throws `new Error('[Paddle] Webhook signature
 *          verification failed')`. This ONE message covers TWO
 *          different underlying causes (see below) — the SDK does not
 *          distinguish them itself.
 *       3. The signature check passes, but `JSON.parse(requestBody)`
 *          then throws a `SyntaxError` — the body isn't valid JSON
 *          despite a genuinely valid signature.
 *
 *   node_modules/@paddle/paddle-node-sdk/dist/cjs/notifications/helpers/webhooks-validator.js
 *     `extractHeader()` parses the `ts=<unix_seconds>;h1=<hex_hmac>`
 *     header format; if either `ts` or `h1` is missing/empty, it throws
 *     `new Error('[Paddle] Invalid webhook signature')` — a DIFFERENT,
 *     distinguishable message from the one above.
 *
 *     `isValidSignature()` (only reached once the header parses)
 *     resolves `false` — collapsing into the generic message above —
 *     for either of two reasons:
 *       a. the timestamp is already more than
 *          `WebhooksValidator.MAX_VALID_TIME_DIFFERENCE` (hard-coded to
 *          **5 seconds** in the installed SDK version) older than now, or
 *       b. the computed HMAC-SHA256 over `${ts}:${rawBody}` doesn't
 *          match the header's `h1`.
 *     Since the SDK gives no signal for which of (a)/(b) actually
 *     happened, this module re-derives the SAME timestamp check the SDK
 *     just ran (same header, same 5-second constant) purely to attach a
 *     diagnostic label — it never re-implements or duplicates the HMAC
 *     comparison itself, and never overrides the SDK's own verdict.
 */

export const WEBHOOK_SIGNATURE_DIAGNOSTIC_LOG_PREFIX = '[paddle-webhook-signature-diagnostic]';

export type WebhookSignatureFailureReason =
  /** `Paddle-Signature` header present but missing `ts=`/`h1=` — the SDK's own `extractHeader()` rejected it before any HMAC comparison. */
  | 'malformed_signature_header'
  /** The header parsed fine, but its `ts` is already more than the SDK's 5-second window old by the time this request was verified — see this module's own doc comment. */
  | 'timestamp_rejected'
  /** The header parsed fine and the timestamp is within the valid window, but the computed HMAC did not match — a wrong/rotated secret, a tampered body, or a genuinely forged request. */
  | 'signature_mismatch'
  /** The signature verified successfully, but the (now-trusted) body was not valid JSON. */
  | 'event_parse_failed'
  /** Anything this module cannot confidently attribute to one of the above — logged rather than silently assumed to be any specific cause. */
  | 'unknown_verification_failure';

/** The exact, fixed strings the installed SDK throws — matched verbatim, never inferred from a substring or a regex that could also match unrelated future SDK text. */
const SDK_MALFORMED_HEADER_MESSAGE = '[Paddle] Invalid webhook signature';
const SDK_VERIFICATION_FAILED_MESSAGE = '[Paddle] Webhook signature verification failed';

/** Mirrors `WebhooksValidator.MAX_VALID_TIME_DIFFERENCE` in the installed `@paddle/paddle-node-sdk` — see this module's doc comment for the exact file. */
const SDK_MAX_VALID_TIME_DIFFERENCE_SECONDS = 5;

export type WebhookSignatureFailureClassification = {
  reason: WebhookSignatureFailureReason;
  /** How many seconds old the header's own `ts` was when classified, when determinable — never the raw timestamp or any part of the signature itself. */
  ageSeconds: number | null;
};

/**
 * Classifies why `paddle.webhooks.unmarshal()` just threw — for
 * diagnostic logging only. `signatureHeader` is read here only to
 * extract the plaintext `ts` value already sent in the clear (never
 * `h1`, the actual HMAC) — this never re-derives or checks the
 * signature itself.
 */
export function classifyWebhookVerificationFailure(
  error: unknown,
  signatureHeader: string
): WebhookSignatureFailureClassification {
  if (error instanceof SyntaxError) {
    return { reason: 'event_parse_failed', ageSeconds: null };
  }

  if (!(error instanceof Error)) {
    return { reason: 'unknown_verification_failure', ageSeconds: null };
  }

  if (error.message === SDK_MALFORMED_HEADER_MESSAGE) {
    return { reason: 'malformed_signature_header', ageSeconds: null };
  }

  if (error.message === SDK_VERIFICATION_FAILED_MESSAGE) {
    const ts = extractTimestamp(signatureHeader);
    if (ts === null) return { reason: 'unknown_verification_failure', ageSeconds: null };

    const ageSeconds = Math.floor((Date.now() - ts * 1000) / 1000);
    if (ageSeconds > SDK_MAX_VALID_TIME_DIFFERENCE_SECONDS) {
      return { reason: 'timestamp_rejected', ageSeconds };
    }
    // Timestamp is within the valid window, so `isValidSignature()`
    // resolving false must have been the HMAC comparison itself —
    // never a guess, since the malformed-header and timestamp branches
    // above have already been ruled out.
    return { reason: 'signature_mismatch', ageSeconds };
  }

  return { reason: 'unknown_verification_failure', ageSeconds: null };
}

/** Mirrors the SDK's own `WebhooksValidator.extractHeader()` parsing — see this module's doc comment — reading only `ts`, never `h1`. */
function extractTimestamp(header: string): number | null {
  for (const part of header.split(';')) {
    const [key, value] = part.split('=');
    if (key === 'ts' && value) {
      const parsed = parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }
  return null;
}

/** Logs only `reason` and, when known, `ageSeconds` — never the header, the body, or the caught error's own message/stack. */
export function logWebhookSignatureFailure(
  classification: WebhookSignatureFailureClassification
): void {
  const safe: Record<string, unknown> = { reason: classification.reason };
  if (typeof classification.ageSeconds === 'number') {
    safe.ageSeconds = classification.ageSeconds;
  }
  console.error(WEBHOOK_SIGNATURE_DIAGNOSTIC_LOG_PREFIX, JSON.stringify(safe));
}
