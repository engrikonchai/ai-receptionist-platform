import { expect, test } from '@playwright/test';

/**
 * Focused coverage for the auth-scoped Daylight dark theme
 * (src/styles/daylight.css's `.dark .daylight-marketing.daylight-auth-scope`
 * block). Never touches /demo or the public landing page — those stay
 * light-only, verified separately in e2e/daylight-landing.spec.ts and
 * e2e/demo.spec.ts, which this file leaves untouched.
 */
test.describe('Daylight auth pages — dark theme', () => {
  test('the theme toggle is reachable and operable by keyboard alone', async ({ page }) => {
    await page.goto('/login');
    const toggle = page.getByRole('button', { name: 'Toggle theme' });
    await toggle.focus();
    await expect(toggle).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('selecting dark mode changes the active theme and persists it', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('html')).not.toHaveClass(/dark/);

    await page.getByRole('button', { name: 'Toggle theme' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    // A real, persisted preference (next-themes' own localStorage key),
    // not just a one-off in-memory class toggle.
    const stored = await page.evaluate(() => window.localStorage.getItem('theme'));
    expect(stored).toBe('dark');

    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('the auth surface receives meaningful dark-theme styling, scoped to the auth pages', async ({
    page
  }) => {
    await page.goto('/login');
    const shell = page.locator('.daylight-marketing');

    const lightBg = await shell.evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.getByRole('button', { name: 'Toggle theme' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    const darkBg = await shell.evaluate((el) => getComputedStyle(el).backgroundColor);

    expect(darkBg).not.toBe(lightBg);
    // The dark auth canvas token (--daylight-navy-deep, #12152B) — a
    // real, calm dark navy, never the light canvas and never pure black.
    expect(darkBg).toBe('rgb(18, 21, 43)');
    expect(darkBg).not.toBe('rgb(0, 0, 0)');
  });

  test('the public landing page never picks up the auth-only dark styling, even with dark mode already on', async ({
    page
  }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Toggle theme' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.goto('/');
    await expect(page.locator('html')).toHaveClass(/dark/);
    const landingBg = await page
      .locator('.daylight-marketing')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    // The landing page's own (light-only) paper background, unaffected by
    // the global dark preference set on the auth page moments ago.
    expect(landingBg).toBe('rgb(251, 246, 238)');
  });

  test('toggling the theme does not change auth validation or submission behavior', async ({
    page
  }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Toggle theme' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Email is required.')).toBeVisible();
    await expect(page.getByText('Password is required.')).toBeVisible();
  });

  test('dashboard route protection is unchanged with dark mode already selected', async ({
    page
  }) => {
    await page.addInitScript(() => window.localStorage.setItem('theme', 'dark'));
    const response = await page.goto('/dashboard/overview');
    expect(response?.ok()).toBe(true);
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Foverview/);
  });
});
