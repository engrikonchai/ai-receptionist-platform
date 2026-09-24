import { describe, expect, it } from 'vitest';
import { NAV_LINKS } from './nav-links';

describe('NAV_LINKS', () => {
  it('has exactly the three real, working anchors the landing page exposes', () => {
    expect(NAV_LINKS).toEqual([
      { href: '#examples', label: 'Examples' },
      { href: '#how-it-works', label: 'How it works' },
      { href: '#control', label: 'Control' }
    ]);
  });

  it('never includes an item for a page that does not exist', () => {
    const labels: readonly string[] = NAV_LINKS.map((link) => link.label);
    expect(labels.includes('Help')).toBe(false);
  });

  it('every href is a same-page section anchor, never an external or dead link', () => {
    for (const link of NAV_LINKS) {
      expect(link.href.startsWith('#')).toBe(true);
    }
  });
});
