import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** The three breakpoints the "Responsive coverage" requirement names. */
export const VIEWPORTS = {
  mobileSmall: { width: 320, height: 568 },
  mobileLarge: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 }
} as const;

/**
 * WCAG 2.5.8 (Target Size Minimum, Level AA) rather than the stricter
 * 44px AAA/HIG figure — this app's default control height is the
 * shadcn `size="default"` button/input (`h-8`, 32px), a deliberate
 * design choice this suite should not treat as a defect. 24px is the
 * "reasonable" floor a smoke test can hold every page to without
 * forcing a component-library-wide resize.
 */
const MIN_TAP_TARGET_PX = 24;

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  expect(
    overflow.scrollWidth,
    'document.documentElement should not scroll horizontally'
  ).toBeLessThanOrEqual(overflow.clientWidth);
}

export async function expectReasonableTapTarget(page: Page, locator: ReturnType<Page['locator']>) {
  const box = await locator.boundingBox();
  expect(box, 'control must have a visible bounding box').not.toBeNull();
  if (!box) return;
  expect(box.height).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
  expect(box.width).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
}

/** Attaches console listeners and returns an accumulator to assert against later. */
export function captureConsoleText(page: Page): { all: () => string } {
  const messages: string[] = [];
  page.on('console', (msg) => messages.push(msg.text()));
  page.on('pageerror', (err) => messages.push(err.message));
  return { all: () => messages.join('\n') };
}
