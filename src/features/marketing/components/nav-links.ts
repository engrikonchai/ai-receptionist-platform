/**
 * The real, working same-page anchors shared between the desktop nav and
 * the mobile disclosure panel so they can never drift apart. Every href
 * is a section id on the landing page; there is no dead link.
 */
export const NAV_LINKS = [
  { href: '#examples', label: 'Examples' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#control', label: 'Control' }
] as const;
