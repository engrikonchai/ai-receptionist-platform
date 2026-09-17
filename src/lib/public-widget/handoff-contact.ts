/**
 * Contact-shape checks and free-text sanitization for the public
 * widget's "Talk to a person" handoff form
 * (src/app/api/public-widget/handoff/route.ts, wired into
 * `publicWidgetHandoffRequestSchema` in schemas.ts as a
 * `.superRefine()` — the same cross-field-validation convention
 * `widgetSettingsSchema`/`knowledgeItemSchema` already use elsewhere in
 * this app, rather than a bespoke ad-hoc validator).
 *
 * Deliberately loose — this never claims an email/phone is
 * *deliverable*, only that it's shaped like one (same philosophy as
 * origin.ts's normalizeOrigin(): reject what's obviously wrong, don't
 * pretend to verify what's merely plausible).
 */

export const HANDOFF_NAME_MAX_LENGTH = 200;
export const HANDOFF_CONTACT_MAX_LENGTH = 320;
export const HANDOFF_MESSAGE_MAX_LENGTH = 1000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** At least 7 digits after stripping common formatting characters — loose on purpose (country codes, extensions, spacing conventions vary too widely to validate strictly). */
const PHONE_SHAPE_PATTERN = /^[0-9+\s().-]{7,32}$/;
const PHONE_MIN_DIGIT_COUNT = 7;

export function isPlausibleEmail(value: string): boolean {
  return value.length > 0 && value.length <= 320 && EMAIL_PATTERN.test(value);
}

export function isPlausiblePhone(value: string): boolean {
  if (!PHONE_SHAPE_PATTERN.test(value)) return false;
  return value.replace(/\D/g, '').length >= PHONE_MIN_DIGIT_COUNT;
}

/**
 * Strips characters that serve no purpose in a name/message field and
 * could otherwise pad out storage or render oddly — control and
 * zero-width characters, but not ordinary newlines/tabs a genuine
 * message might contain. React's default text-node rendering (used
 * everywhere this ends up displayed — see
 * src/features/inbox/components/customer-details-panel.tsx,
 * src/features/leads/components/*) already escapes HTML, so this is
 * about tidiness and storage hygiene, not XSS — this app never uses
 * `dangerouslySetInnerHTML` for user-submitted content.
 */
export function sanitizeFreeText(value: string, maxLength: number): string {
  const withoutControlChars = value
    // eslint-disable-next-line no-control-regex -- deliberately stripping C0/C1 control + zero-width characters, keeping \t (\x09) and \n (\x0a)
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f​-‍﻿]/g, '')
    .trim();
  return withoutControlChars.length > maxLength
    ? withoutControlChars.slice(0, maxLength)
    : withoutControlChars;
}

/**
 * The single-line "contact" text stored in leads.contact /
 * handoffs.contact — both existing columns are one free-text field,
 * not separate email/phone columns. Only called once the schema's own
 * superRefine has already confirmed at least one of the two is present
 * and plausible.
 */
export function buildContactLine(email: string, phone: string): string {
  return [email, phone].filter(Boolean).join(' · ');
}
