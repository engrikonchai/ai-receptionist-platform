import { ApiError } from '@paddle/paddle-node-sdk';

/**
 * Safe, server-side diagnostic logging for `startCheckout()`
 * (service.ts) and `claimCheckoutAttempt()`/`recordTransactionId()`
 * (checkout-attempts.ts). Those functions deliberately return only a
 * generic `GENERIC_BILLING_ERROR` to the browser on any failure — this
 * module is how an on-call engineer can still tell WHICH stage failed
 * and WHY, from Vercel's log output, without that detail ever reaching
 * the client or a log line ever carrying a secret.
 *
 * Every log line starts with `CHECKOUT_DIAGNOSTIC_LOG_PREFIX` — grep
 * Vercel logs for that exact string.
 *
 * Hard rule: only ever logs `stage`, `httpStatus`, `paddleErrorCode`,
 * `paddleErrorType`, and `supabaseErrorCode` — every one of these is a
 * short, closed-vocabulary or numeric value, never free text. NEVER
 * logs an API key, webhook secret, client token, authorization header,
 * request/response body, customer email, customer id, business id,
 * transaction id, or a full error object/stack trace. `ApiError`'s own
 * `.message`/`.detail`/`.errors`/`.documentationUrl` are deliberately
 * never read here — Paddle's own error detail text could echo back
 * caller-supplied values (e.g. a validation message quoting the email
 * that failed) and is exactly the kind of free text this module must
 * never touch.
 */
export const CHECKOUT_DIAGNOSTIC_LOG_PREFIX = '[paddle-checkout-diagnostic]';

export type CheckoutDiagnosticStage =
  | 'resolve_customer'
  | 'create_transaction'
  | 'record_transaction_id'
  | 'checkout_attempt_lookup'
  | 'checkout_attempt_insert';

type SafeDiagnosticDetails = {
  httpStatus?: number | null;
  paddleErrorCode?: string | null;
  paddleErrorType?: string | null;
  supabaseErrorCode?: string | null;
};

/** Logs exactly the stage name plus whichever safe fields are present — never anything else. */
export function logCheckoutDiagnostic(
  stage: CheckoutDiagnosticStage,
  details: SafeDiagnosticDetails = {}
): void {
  const safe: Record<string, unknown> = { stage };
  if (typeof details.httpStatus === 'number') safe.httpStatus = details.httpStatus;
  if (typeof details.paddleErrorCode === 'string') safe.paddleErrorCode = details.paddleErrorCode;
  if (typeof details.paddleErrorType === 'string') safe.paddleErrorType = details.paddleErrorType;
  if (typeof details.supabaseErrorCode === 'string') {
    safe.supabaseErrorCode = details.supabaseErrorCode;
  }
  console.error(CHECKOUT_DIAGNOSTIC_LOG_PREFIX, JSON.stringify(safe));
}

/**
 * Extracts only the safe, closed-vocabulary fields from a thrown Paddle
 * SDK error — an `ApiError`'s `.code`/`.type` (short enum-like values
 * such as `"customer_already_exists"`/`"request_error"`, never its
 * free-text `.detail`), plus a numeric HTTP status if the thrown value
 * happens to carry one (the SDK's own `ApiError` does not, but this
 * stays defensive against any error shape that does). Never throws —
 * a value it can't classify safely just yields nulls.
 */
export function extractPaddleErrorDetails(error: unknown): {
  httpStatus: number | null;
  paddleErrorCode: string | null;
  paddleErrorType: string | null;
} {
  const httpStatus = extractNumericStatus(error);

  if (error instanceof ApiError) {
    return {
      httpStatus,
      paddleErrorCode: typeof error.code === 'string' ? error.code : null,
      paddleErrorType: typeof error.type === 'string' ? error.type : null
    };
  }

  return { httpStatus, paddleErrorCode: null, paddleErrorType: null };
}

function extractNumericStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const candidate = error as { status?: unknown; statusCode?: unknown };
  const status = candidate.status ?? candidate.statusCode;
  return typeof status === 'number' ? status : null;
}
