import * as z from 'zod';

/**
 * Mirrors ChatbotDemo's own `lib/validation/widget.ts` request shapes
 * exactly (`widgetSessionRequestSchema` / `widgetMessageRequestSchema`)
 * — the proxy forwards these fields verbatim, so the contract must stay
 * byte-identical. This is intentionally a separate, duplicated copy
 * (not imported cross-repo, which isn't possible anyway) — validating
 * here lets the proxy reject obviously-malformed requests before ever
 * reaching the widget_public_config lookup or the upstream runtime, but
 * ChatbotDemo's own schema remains the authoritative validator for
 * anything that reaches it.
 */
const publicWidgetIdSchema = z.uuid({ message: 'Invalid widget id.' });
const conversationIdSchema = z.uuid({ message: 'Invalid conversation id.' });
const visitorIdSchema = z.string().trim().min(8).max(200, { message: 'Invalid visitor id.' });
const languageSchema = z.enum(['en', 'me', 'ru']);

export const publicWidgetSessionRequestSchema = z.object({
  publicWidgetId: publicWidgetIdSchema,
  visitorId: visitorIdSchema,
  language: languageSchema.optional(),
  conversationId: conversationIdSchema.optional()
});

export const publicWidgetMessageRequestSchema = z.object({
  publicWidgetId: publicWidgetIdSchema,
  visitorId: visitorIdSchema,
  conversationId: conversationIdSchema,
  message: z.string().trim().min(1, 'Message cannot be empty.').max(2000)
});

export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Invalid request.';
}
