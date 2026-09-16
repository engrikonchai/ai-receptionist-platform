import { handlePreflight, publicWidgetJson, readJsonBody } from '@/lib/public-widget/http';
import { corsHeadersFor } from '@/lib/public-widget/origin';
import {
  checkRateLimit,
  RATE_LIMIT_EXCEEDED_MESSAGE,
  RATE_LIMIT_UNAVAILABLE_MESSAGE
} from '@/lib/public-widget/rate-limit';
import { postMessage } from '@/lib/public-widget/runtime';
import { firstIssueMessage, publicWidgetMessageRequestSchema } from '@/lib/public-widget/schemas';

const RUNTIME_UNAVAILABLE_MESSAGE =
  "The chat assistant isn't available right now. Please try again shortly.";
const UNAUTHORIZED_MESSAGE = 'This chat session is no longer valid. Please refresh and try again.';

/**
 * Public, unauthenticated endpoint — sends one visitor chat turn.
 * Requires a valid session token (see
 * src/lib/public-widget/session-token.ts) whose claims match this
 * request's own `publicWidgetId`/`conversationId`/`visitorId` and the
 * freshly resolved business — an unknown, expired, tampered, or
 * cross-visitor token, and a conversation id that simply doesn't belong
 * to this business+visitor, all produce the exact same generic 401.
 */
export async function POST(request: Request) {
  const originHeader = request.headers.get('origin');
  const headers = originHeader ? corsHeadersFor(originHeader) : undefined;

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) {
    return publicWidgetJson(400, { error: 'Invalid JSON body.' });
  }

  const parsed = publicWidgetMessageRequestSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return publicWidgetJson(400, { error: firstIssueMessage(parsed.error) });
  }

  const rateLimit = await checkRateLimit('message', parsed.data.publicWidgetId, request);
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

  const result = await postMessage({
    publicWidgetId: parsed.data.publicWidgetId,
    visitorId: parsed.data.visitorId,
    conversationId: parsed.data.conversationId,
    message: parsed.data.message,
    sessionToken: parsed.data.sessionToken,
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
      return publicWidgetJson(200, { enabled: false }, headers);
    case 'unavailable':
      return publicWidgetJson(503, { error: RUNTIME_UNAVAILABLE_MESSAGE }, headers);
    case 'unauthorized':
      return publicWidgetJson(401, { error: UNAUTHORIZED_MESSAGE }, headers);
    case 'ok':
      return publicWidgetJson(200, { messages: result.messages }, headers);
  }
}

export async function OPTIONS(request: Request) {
  return handlePreflight(request);
}
