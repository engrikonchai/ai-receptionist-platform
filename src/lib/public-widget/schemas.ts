import * as z from 'zod';
import {
  HANDOFF_CONTACT_MAX_LENGTH,
  HANDOFF_MESSAGE_MAX_LENGTH,
  HANDOFF_NAME_MAX_LENGTH,
  isPlausibleEmail,
  isPlausiblePhone
} from './handoff-contact';

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

/**
 * A client-generated idempotency key for one handoff-form submission —
 * see supabase/migrations/20260918090000_handoff_idempotency.sql.
 * Shape-checked only; a well-formed but arbitrary string is fine, it
 * only needs to be stable across a retry of the same submission.
 */
const clientRequestIdSchema = z.string().trim().min(8).max(200);

/**
 * The public widget's "Talk to a person" contact form. Cross-field
 * validation ("at least one of email/phone, and each must look
 * plausible") is a `.superRefine()` below — the same convention
 * `widgetSettingsSchema`/`knowledgeItemSchema` already use elsewhere in
 * this app for a rule that can't be expressed on a single field alone
 * (see src/features/widget/schemas/widget.ts's handoffEmail-required-
 * when-enabled refine for the closest precedent).
 */
export const publicWidgetHandoffRequestSchema = z
  .object({
    publicWidgetId: publicWidgetIdSchema,
    visitorId: visitorIdSchema,
    conversationId: conversationIdSchema,
    sessionToken: sessionTokenSchema,
    clientRequestId: clientRequestIdSchema,
    name: z
      .string()
      .trim()
      .min(1, 'Enter your name.')
      .max(HANDOFF_NAME_MAX_LENGTH, 'Keep your name under 200 characters.'),
    email: z
      .string()
      .trim()
      .max(HANDOFF_CONTACT_MAX_LENGTH, 'Keep your email under 320 characters.')
      .optional(),
    phone: z
      .string()
      .trim()
      .max(HANDOFF_CONTACT_MAX_LENGTH, 'Keep your phone number under 320 characters.')
      .optional(),
    message: z
      .string()
      .trim()
      .max(HANDOFF_MESSAGE_MAX_LENGTH, 'Keep your message under 1000 characters.')
      .optional(),
    consent: z.literal(true, { error: 'Please confirm you agree to be contacted.' })
  })
  .superRefine((data, ctx) => {
    const email = data.email?.trim() ?? '';
    const phone = data.phone?.trim() ?? '';

    if (!email && !phone) {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter an email address or phone number.',
        path: ['email']
      });
      return;
    }

    if (email && !isPlausibleEmail(email)) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid email address.', path: ['email'] });
    }

    if (phone && !isPlausiblePhone(phone)) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number.', path: ['phone'] });
    }
  });

export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Invalid request.';
}
