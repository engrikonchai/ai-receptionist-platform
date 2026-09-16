import { handlePreflight, publicWidgetJson, readJsonBody } from '@/lib/public-widget/http';
import { corsHeadersFor } from '@/lib/public-widget/origin';
import {
  checkRateLimit,
  RATE_LIMIT_EXCEEDED_MESSAGE,
  RATE_LIMIT_UNAVAILABLE_MESSAGE
} from '@/lib/public-widget/rate-limit';
import { startOrContinueSession } from '@/lib/public-widget/runtime';
import { firstIssueMessage, publicWidgetSessionRequestSchema } from '@/lib/public-widget/schemas';

const RUNTIME_UNAVAILABLE_MESSAGE =
  "The chat assistant isn't available right now. Please try again shortly.";

/**
 * Public, unauthenticated endpoint — starts or resumes a visitor's chat
 * session. Never accepts a `business_id`; `startOrContinueSession()`
 * resolves the request's `publicWidgetId` to a business itself (see
 * src/lib/public-widget/runtime.ts) and every row it creates is scoped
 * to that resolved business. A resumed session also requires a valid,
 * matching session token (see src/lib/public-widget/session-token.ts) —
 * without one it always starts a fresh conversation instead of erroring.
 */
export async function POST(request: Request) {
  const originHeader = request.headers.get('origin');
  const headers = originHeader ? corsHeadersFor(originHeader) : undefined;

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) {
    return publicWidgetJson(400, { error: 'Invalid JSON body.' });
  }

  const parsed = publicWidgetSessionRequestSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return publicWidgetJson(400, { error: firstIssueMessage(parsed.error) });
  }

  const rateLimit = await checkRateLimit('session', parsed.data.publicWidgetId, request);
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

  const result = await startOrContinueSession({
    publicWidgetId: parsed.data.publicWidgetId,
    visitorId: parsed.data.visitorId,
    language: parsed.data.language,
    conversationId: parsed.data.conversationId,
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
    case 'ok':
      return publicWidgetJson(
        200,
        {
          enabled: true,
          conversationId: result.conversationId,
          sessionToken: result.sessionToken,
          messages: result.messages
        },
        headers
      );
  }
}

export async function OPTIONS(request: Request) {
  return handlePreflight(request);
}
