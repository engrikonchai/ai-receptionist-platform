import { handlePreflight, publicWidgetJson, readJsonBody } from '@/lib/public-widget/http';
import { corsHeadersFor } from '@/lib/public-widget/origin';
import {
  checkRateLimit,
  RATE_LIMIT_EXCEEDED_MESSAGE,
  RATE_LIMIT_UNAVAILABLE_MESSAGE
} from '@/lib/public-widget/rate-limit';
import { submitHandoffRequest } from '@/lib/public-widget/runtime';
import { firstIssueMessage, publicWidgetHandoffRequestSchema } from '@/lib/public-widget/schemas';

const RUNTIME_UNAVAILABLE_MESSAGE =
  "The chat assistant isn't available right now. Please try again shortly.";
const UNAUTHORIZED_MESSAGE = 'This chat session is no longer valid. Please refresh and try again.';
const HANDOFF_DISABLED_MESSAGE = 'Talking to a person isn’t available for this chat right now.';

/**
 * Public, unauthenticated endpoint — a visitor's "Talk to a person"
 * contact-form submission. Requires a valid session token (see
 * src/lib/public-widget/session-token.ts) whose claims match this
 * request's own `publicWidgetId`/`conversationId`/`visitorId` and the
 * freshly resolved business — exactly the same authorization
 * `postMessage()`/POST /api/public-widget/message already enforces
 * (see src/lib/public-widget/runtime.ts's submitHandoffRequest(),
 * which shares that same resolve → verify-token → load-own-
 * conversation sequence). An unknown, expired, tampered, or
 * cross-visitor token, and a conversation id that simply doesn't
 * belong to this business+visitor, all produce the exact same generic
 * 401 — never a signal a caller could use to enumerate either one.
 *
 * `businessId` is never accepted from or returned to the browser at
 * any point in this file — see runtime.ts's own module doc comment for
 * why.
 */
export async function POST(request: Request) {
  const originHeader = request.headers.get('origin');
  const headers = originHeader ? corsHeadersFor(originHeader) : undefined;

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) {
    return publicWidgetJson(400, { error: 'Invalid JSON body.' });
  }

  const parsed = publicWidgetHandoffRequestSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return publicWidgetJson(400, { error: firstIssueMessage(parsed.error) }, headers);
  }

  const rateLimit = await checkRateLimit('handoff', parsed.data.publicWidgetId, request);
  if (rateLimit.status === 'limited') {
    return publicWidgetJson(
      429,
      { error: RATE_LIMIT_EXCEEDED_MESSAGE },
      { ...headers, 'Retry-After': String(rateLimit.retryAfterSeconds) }
    );
  }
  if (rateLimit.status === 'unavailable') {
    return publicWidgetJson(503, { error: RATE_LIMIT_UNAVAILABLE_MESSAGE }, headers);
  }

  const result = await submitHandoffRequest({
    publicWidgetId: parsed.data.publicWidgetId,
    visitorId: parsed.data.visitorId,
    conversationId: parsed.data.conversationId,
    sessionToken: parsed.data.sessionToken,
    clientRequestId: parsed.data.clientRequestId,
    name: parsed.data.name,
    email: parsed.data.email,
    phone: parsed.data.phone,
    message: parsed.data.message,
    originHeader
  });

  switch (result.status) {
    case 'unknown':
      return publicWidgetJson(404, { error: 'Widget not found.' });
    case 'origin_denied':
      return publicWidgetJson(
        403,
        { error: 'This widget is not enabled for this website.' },
        headers
      );
    case 'disabled':
      return publicWidgetJson(200, { enabled: false, error: HANDOFF_DISABLED_MESSAGE }, headers);
    case 'unavailable':
      return publicWidgetJson(503, { error: RUNTIME_UNAVAILABLE_MESSAGE }, headers);
    case 'unauthorized':
      return publicWidgetJson(401, { error: UNAUTHORIZED_MESSAGE }, headers);
    case 'ok':
      return publicWidgetJson(200, { success: true }, headers);
  }
}

export async function OPTIONS(request: Request) {
  return handlePreflight(request);
}
