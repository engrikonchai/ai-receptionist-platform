import { handlePreflight, proxyToChatRuntime, publicWidgetJson } from '@/lib/public-widget/proxy';
import { firstIssueMessage, publicWidgetSessionRequestSchema } from '@/lib/public-widget/schemas';

/**
 * Public, unauthenticated endpoint — this is what the embeddable widget
 * shell (src/app/widget/[publicWidgetId]) calls to start or resume a
 * visitor's chat session. Never uses the service-role key; see
 * proxyToChatRuntime() for the full validate-then-forward contract
 * (widget id, origin allow-list, enabled state, then a server-to-server
 * forward to ChatbotDemo's real /api/widget/session).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return publicWidgetJson(400, { error: 'Invalid JSON body.' });
  }

  const parsed = publicWidgetSessionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return publicWidgetJson(400, { error: firstIssueMessage(parsed.error) });
  }

  return proxyToChatRuntime({
    request,
    upstreamPath: '/api/widget/session',
    body: parsed.data
  });
}

export async function OPTIONS(request: Request) {
  return handlePreflight(request);
}
