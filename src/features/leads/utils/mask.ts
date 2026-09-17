/**
 * Never renders a lead's contact info in full outside the authenticated
 * detail view. `leads.contact` is a single free-text field (see
 * buildContactLine() in src/lib/public-widget/handoff-contact.ts) that
 * may hold an email, a phone number, or both joined by " · " — each
 * part is masked on its own so the join stays legible.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_PART_SEPARATOR = ' · ';

/** Same first-2/last-4 shape as maskVisitorId() in src/features/inbox/utils/mask.ts — kept short enough to only tell two rows apart, never enough to be usable outside this app. */
function maskGenericToken(token: string): string {
  if (token.length <= 6) return '••••';
  return `${token.slice(0, 2)}••••${token.slice(-4)}`;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  const maskedLocal = local.length <= 1 ? '•' : `${local[0]}•••`;

  const domainParts = domain.split('.');
  const tld = domainParts.pop() ?? '';
  const domainName = domainParts.join('.');
  const maskedDomain = domainName.length <= 1 ? '•' : `${domainName[0]}•••`;

  return `${maskedLocal}@${maskedDomain}.${tld}`;
}

/** Masks a lead's full contact string — safe to render anywhere in a list view. */
export function maskContact(contact: string): string {
  const trimmed = contact.trim();
  if (!trimmed) return '••••';

  const parts = trimmed.split(CONTACT_PART_SEPARATOR).filter(Boolean);
  if (parts.length === 0) return '••••';

  return parts
    .map((part) => (EMAIL_PATTERN.test(part) ? maskEmail(part) : maskGenericToken(part)))
    .join(CONTACT_PART_SEPARATOR);
}
