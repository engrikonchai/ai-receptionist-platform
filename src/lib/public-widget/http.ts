import { corsHeadersFor } from './origin';

/**
 * Abuse-protection boundary #1: a hard cap on request body size,
 * enforced before `JSON.parse` ever runs — well above any legitimate
 * payload (the largest field, `message`, is itself capped at 2000
 * characters by Zod in schemas.ts) but small enough to reject a
 * deliberately oversized body cheaply, before spending CPU parsing it.
 */
export const MAX_REQUEST_BODY_BYTES = 10_000;

export function publicWidgetJson(status: number, body: unknown, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers });
}

/**
 * Reads and parses a request body with the size cap above applied to
 * the raw bytes, not just the parsed value — a huge, unparseable body
 * (or one crafted to be slow to parse) is rejected before `JSON.parse`
 * ever sees it.
 */
export async function readJsonBody(
  request: Request
): Promise<{ ok: true; body: unknown } | { ok: false }> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false };
  }

  if (new TextEncoder().encode(text).length > MAX_REQUEST_BODY_BYTES) {
    return { ok: false };
  }

  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/** Shared OPTIONS preflight handler — carries no data, real enforcement happens on the POST. */
export function handlePreflight(request: Request): Response {
  const originHeader = request.headers.get('origin');
  if (!originHeader) return new Response(null, { status: 204 });
  return new Response(null, { status: 204, headers: corsHeadersFor(originHeader) });
}
