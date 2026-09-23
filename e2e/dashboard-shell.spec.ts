import { expect, test } from '@playwright/test';

/**
 * Milestone 4 — focused coverage for the Daylight dashboard shell.
 *
 * Every real /dashboard/* route requires a live authenticated Supabase
 * session, unreachable in this suite (placeholder, unreachable host —
 * see playwright.config.ts). What e2e CAN verify without one: that
 * every real nav destination still resolves through the exact same
 * protected-route redirect (dashboard-redirect.spec.ts and
 * dashboard-agent-redirect.spec.ts already cover /dashboard/overview
 * and /dashboard/agent in full depth; this file extends that same
 * check to the rest of the real nav-config.ts routes), and that the
 * new `.daylight-dashboard` scope never leaks onto a page that isn't
 * the authenticated shell. The shell's own rendering (sidebar, header,
 * active state, mobile drawer, light/dark tokens) is covered instead
 * by component-level unit tests (app-sidebar.test.tsx,
 * business-switcher.test.tsx, owner-menu.test.tsx) that render the
 * real production components directly — the same approach this
 * repository already used for every other dashboard-shell piece.
 */
const REAL_NAV_ROUTES = [
  '/dashboard/inbox',
  '/dashboard/leads',
  '/dashboard/knowledge',
  '/dashboard/channels',
  '/dashboard/widget',
  '/dashboard/billing',
  '/dashboard/team',
  '/dashboard/settings'
] as const;

test.describe('Dashboard shell — every real nav route stays protected', () => {
  for (const path of REAL_NAV_ROUTES) {
    test(`${path} redirects a signed-out visitor to /login with a safe next param`, async ({
      page
    }) => {
      const response = await page.goto(path);
      expect(response?.ok()).toBe(true);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path)}$`));
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    });
  }

  test('/dashboard itself redirects through to /login, not into the app', async ({ page }) => {
    const response = await page.goto('/dashboard');
    expect(response?.ok()).toBe(true);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });
});

test.describe('Dashboard shell — theme isolation', () => {
  test('the .daylight-dashboard scope never appears on the public landing page, /demo, or /login', async ({
    page
  }) => {
    for (const path of ['/', '/demo', '/login']) {
      await page.goto(path);
      const hasDashboardScope = await page.evaluate(
        () => document.querySelectorAll('.daylight-dashboard').length
      );
      expect(hasDashboardScope, `${path} unexpectedly carries .daylight-dashboard`).toBe(0);
    }
  });
});
