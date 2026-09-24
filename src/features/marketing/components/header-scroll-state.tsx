'use client';

import { useEffect } from 'react';

/**
 * Sets `data-scrolled` on the sticky marketing header once the page has
 * moved past the top, so the header can separate from content passing
 * under it (border + shadow, styled in marketing-header.tsx). Toggles
 * the attribute directly on the DOM node rather than through state, so
 * scrolling never re-renders anything; it only writes when the value
 * actually changes.
 */
export function HeaderScrollState() {
  useEffect(() => {
    const header = document.getElementById('marketing-header');
    if (!header) return;

    const update = () => {
      const scrolled = window.scrollY > 4;
      if (header.dataset.scrolled !== String(scrolled)) {
        header.dataset.scrolled = String(scrolled);
      }
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  return null;
}
