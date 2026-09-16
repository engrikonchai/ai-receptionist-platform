import * as z from 'zod';

/**
 * The public widget runtime's own authoritative request schemas (see
 * src/lib/public-widget/runtime.ts) — validating here rejects
 * obviously-malformed requests (missing fields, an over-length message,
 * a non-UUID id) before ever resolving a widget or touching the
 * database. `message`'s 2000-character cap is this app's actual
 * abuse-protection boundary for message length; see
 * src/lib/public-widget/http.ts for the separate raw-body-size cap
 * enforced even before this schema runs.
 */
const publicWidgetIdSchema = z.uuid({ message: 'Invalid widget id.' });
const conversationIdSchema = z.uuid({ message: 'Invalid conversation id.' });
const visitorIdSchema = z.string().trim().min(8).max(200, { message: 'Invalid visitor id.' });
const languageSchema = z.enum(['en', 'me', 'ru']);
/** Opaque `<base64url payload>.<base64url signature>` string — see session-token.ts. Shape-checked here only; signature/expiry/claim verification happens in runtime.ts. */
const sessionTokenSchema = z.string().trim().min(1).max(4000);

export const publicWidgetSessionRequestSchema = z.object({
  publicWidgetId: publicWidgetIdSchema,
  visitorId: visitorIdSchema,
  language: languageSchema.optional(),
  conversationId: conversationIdSchema.optional(),
  /** Presented only when resuming a previous conversation — a first-time visitor's session request has neither this nor conversationId. */
  sessionToken: sessionTokenSchema.optional()
});

export const publicWidgetMessageRequestSchema = z.object({
  publicWidgetId: publicWidgetIdSchema,
  visitorId: visitorIdSchema,
  conversationId: conversationIdSchema,
  message: z.string().trim().min(1, 'Message cannot be empty.').max(2000),
  sessionToken: sessionTokenSchema
});

export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Invalid request.';
}
