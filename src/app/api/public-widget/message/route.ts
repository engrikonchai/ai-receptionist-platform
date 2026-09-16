import { handlePreflight, publicWidgetJson, readJsonBody } from '@/lib/public-widget/http';
import { corsHeadersFor } from '@/lib/public-widget/origin';
import {
  checkRateLimit,
  clientIpFrom,
  MESSAGE_RATE_LIMIT,
  RATE_LIMIT_EXCEEDED_MESSAGE
} from '@/lib/public-widget/rate-limit';
import { postMessage } from '@/lib/public-widget/runtime';
import { firstIssueMessage, publicWidgetMessageRequestSchema } from '@/lib/public-widget/schemas';

const RUNTIME_UNAVAILABLE_MESSAGE =
  "The chat assistant isn't available right now. Please try again shortly.";

/**
 * Public, unauthenticated endpoint — sends one visitor chat turn.
 * `postMessage()` re-resolves `publicWidgetId` to a business and
 * confirms `conversationId` actually belongs to that business before
 * touching it (src/lib/public-widget/runtime.ts) — a conversation id
 * borrowed from a different business's widget is never readable or
 * writable here.
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

  const rateLimitKey = `message:${parsed.data.publicWidgetId}:${clientIpFrom(request)}`;
  if (!checkRateLimit(rateLimitKey, MESSAGE_RATE_LIMIT.limit, MESSAGE_RATE_LIMIT.windowMs)) {
    return publicWidgetJson(429, { error: RATE_LIMIT_EXCEEDED_MESSAGE }, headers);
  }

  const result = await postMessage({
    publicWidgetId: parsed.data.publicWidgetId,
    visitorId: parsed.data.visitorId,
    conversationId: parsed.data.conversationId,
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
      return publicWidgetJson(200, { enabled: false }, headers);
    case 'unavailable':
      return publicWidgetJson(503, { error: RUNTIME_UNAVAILABLE_MESSAGE }, headers);
    case 'conversation_not_found':
      return publicWidgetJson(404, { error: 'Conversation not found.' }, headers);
    case 'ok':
      return publicWidgetJson(200, { messages: result.messages }, headers);
  }
}

export async function OPTIONS(request: Request) {
  return handlePreflight(request);
}
