import { handlePreflight, proxyToChatRuntime, publicWidgetJson } from '@/lib/public-widget/proxy';
import { firstIssueMessage, publicWidgetMessageRequestSchema } from '@/lib/public-widget/schemas';

/**
 * Public, unauthenticated endpoint — sends one visitor chat turn. See
 * ./session/route.ts and proxyToChatRuntime() for the shared
 * validate-then-forward contract this follows exactly.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return publicWidgetJson(400, { error: 'Invalid JSON body.' });
  }

  const parsed = publicWidgetMessageRequestSchema.safeParse(body);
  if (!parsed.success) {
    return publicWidgetJson(400, { error: firstIssueMessage(parsed.error) });
  }

  return proxyToChatRuntime({
    request,
    upstreamPath: '/api/widget/message',
    body: parsed.data
  });
}

export async function OPTIONS(request: Request) {
  return handlePreflight(request);
}
