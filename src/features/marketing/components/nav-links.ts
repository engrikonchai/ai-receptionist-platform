/**
 * The three real, working anchors this milestone's Header spec lists —
 * Product, How it works, Demo/product-preview — shared between the
 * desktop nav and the mobile disclosure panel so they can never drift
 * apart. Every href is a real section id on this same page; there is
 * no fourth "Help" item (the approved export's mobile-nav reference
 * still shows one, but no public Help route exists yet — see
 * docs/daylight-design-system.md).
 */
export const NAV_LINKS = [
  { href: '#capabilities', label: 'Product' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#product-preview', label: 'Demo' }
] as const;
