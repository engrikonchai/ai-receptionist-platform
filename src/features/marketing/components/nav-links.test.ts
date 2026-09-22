import { describe, expect, it } from 'vitest';
import { NAV_LINKS } from './nav-links';

describe('NAV_LINKS', () => {
  it('has exactly the three real, working anchors this milestone specifies', () => {
    expect(NAV_LINKS).toEqual([
      { href: '#capabilities', label: 'Product' },
      { href: '#how-it-works', label: 'How it works' },
      { href: '#product-preview', label: 'Demo' }
    ]);
  });

  it('never includes the obsolete "Help" item from the raw design export', () => {
    const labels: readonly string[] = NAV_LINKS.map((link) => link.label);
    expect(labels.includes('Help')).toBe(false);
  });

  it('every href is a same-page section anchor, never an external or dead link', () => {
    for (const link of NAV_LINKS) {
      expect(link.href.startsWith('#')).toBe(true);
    }
  });
});
