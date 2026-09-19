import { expect, test } from '@playwright/test';
import {
  captureConsoleText,
  expectNoHorizontalOverflow,
  expectReasonableTapTarget,
  VIEWPORTS
} from './helpers';

/**
 * These three pages render their real form controls (rather than the
 * "Supabase not configured" notice) because playwright.config.ts hands
 * the dev server harmless placeholder `NEXT_PUBLIC_SUPABASE_*` values —
 * see that file for why. No test below performs a real sign-in/sign-up:
 * every submission here either fails client-side Zod validation before
 * any network call, or (the two "never leaks the password" cases)
 * reaches only the unreachable loopback placeholder, never a real
 * Supabase project.
 */
const AUTH_PAGES = [
  { path: '/login', heading: 'Sign in', submitLabel: 'Sign in' },
  { path: '/signup', heading: 'Create your account', submitLabel: 'Create account' },
  { path: '/forgot-password', heading: 'Forgot your password?', submitLabel: 'Send reset link' }
] as const;

for (const { path, heading, submitLabel } of AUTH_PAGES) {
  test.describe(path, () => {
    test('loads without crashing and shows the heading and submit control', async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.ok()).toBe(true);
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await expect(page.getByRole('button', { name: submitLabel })).toBeVisible();
    });

    test('every form control has an accessible name', async ({ page }) => {
      await page.goto(path);
      const controls = page.locator('form input, form button');
      const count = await controls.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        await expect(controls.nth(i)).toHaveAccessibleName(/.+/);
      }
    });

    test('Tab reaches the primary controls in logical order', async ({ page }) => {
      await page.goto(path);

      const fieldNames = await page
        .locator('form input[name]')
        .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).name));
      expect(fieldNames.length).toBeGreaterThan(0);

      const seenOrder: string[] = [];
      for (let i = 0; i < 25 && seenOrder.length < fieldNames.length; i++) {
        await page.keyboard.press('Tab');
        const name = await page.evaluate(
          () => (document.activeElement as HTMLInputElement | null)?.name ?? null
        );
        if (name && fieldNames.includes(name) && !seenOrder.includes(name)) {
          seenOrder.push(name);
        }
      }

      expect(seenOrder).toEqual(fieldNames);
    });

    for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
      test(`fits the viewport with no horizontal overflow at ${viewportName} (${viewport.width}x${viewport.height})`, async ({
        page
      }) => {
        await page.setViewportSize(viewport);
        await page.goto(path);

        await expectNoHorizontalOverflow(page);

        const form = page.locator('form');
        const box = await form.boundingBox();
        expect(box).not.toBeNull();
        if (box) {
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
        }

        await expectReasonableTapTarget(page, page.getByRole('button', { name: submitLabel }));
      });
    }
  });
}

test.describe('/login — light and dark mode', () => {
  test('theme toggle switches the page between light and dark without an app change', async ({
    page
  }) => {
    await page.goto('/login');

    const html = page.locator('html');
    await expect(html).not.toHaveClass(/dark/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    await page.getByRole('button', { name: 'Toggle theme' }).click();

    await expect(html).toHaveClass(/dark/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });
});

test.describe('password values never leak', () => {
  // Both cases below trip a client-side Zod validation error (invalid
  // email; too-short password) that resolves before any network call —
  // deliberately never a real `signIn`/`signUp` attempt, which would
  // reach only the unreachable placeholder Supabase host and could hang
  // or reject unpredictably rather than ever rendering a visible error.

  test('login: an invalid-email validation failure never shows or logs the typed password', async ({
    page
  }) => {
    const pageConsole = captureConsoleText(page);
    const password = 'super-secret-value-1';
    await page.goto('/login');

    await page.getByLabel('Email').fill('not-an-email');
    await page.getByLabel(/^Password/).fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('Enter a valid email address.')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(password);
    expect(pageConsole.all()).not.toContain(password);
  });

  test('signup: a too-short-password validation failure never shows or logs the typed password', async ({
    page
  }) => {
    const pageConsole = captureConsoleText(page);
    const password = 'short1';
    await page.goto('/signup');

    await page.getByLabel('Display name').fill('E2E Smoke Test');
    await page.getByLabel('Email').fill('owner@example.com');
    await page.getByLabel(/^Password/).fill(password);
    await page.getByLabel(/^Confirm password/).fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText('Password must be at least 8 characters.')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(password);
    expect(pageConsole.all()).not.toContain(password);
  });
});
