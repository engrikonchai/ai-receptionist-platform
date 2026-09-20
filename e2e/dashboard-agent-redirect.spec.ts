import { expect, test } from '@playwright/test';
import { captureConsoleText } from './helpers';

test.describe('/dashboard/agent — signed out', () => {
  test('redirects safely to /login, with no redirect loop, server error, or leaked info', async ({
    page
  }) => {
    const pageConsole = captureConsoleText(page);

    const response = await page.goto('/dashboard/agent');
    expect(response?.ok()).toBe(true);

    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fagent/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    // A second visit must land on the same /login target, not bounce
    // somewhere else or back into /dashboard — i.e. no redirect loop.
    const secondResponse = await page.goto('/dashboard/agent');
    expect(secondResponse?.ok()).toBe(true);
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fagent/);

    const bodyText = (await page.locator('body').innerText()).toLowerCase();
    for (const secret of [
      'supabase_service_role',
      'service_role',
      'paddle_api_key',
      'anon_key',
      'stack trace',
      'prisma'
    ]) {
      expect(bodyText).not.toContain(secret);
    }
    expect(pageConsole.all()).not.toContain('service_role');
  });

  test('never renders a Next.js server-error page', async ({ page }) => {
    const response = await page.goto('/dashboard/agent');
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByText('Application error')).not.toBeVisible();
  });
});
