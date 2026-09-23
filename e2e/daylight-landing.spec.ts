import { expect, test } from '@playwright/test';
import { captureConsoleText, expectNoHorizontalOverflow } from './helpers';

const FORBIDDEN_CLAIMS = [
  'phone support',
  'voice support',
  'microphone',
  'whatsapp',
  'instagram',
  'sms',
  'calendar',
  'appointment booking',
  'every channel',
  'three-minute setup',
  'free calls'
];

test.describe('/ — Daylight public landing page', () => {
  test('is publicly accessible and shows the hero heading', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.ok()).toBe(true);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Every customer gets an answer.'
    );
  });

  test('exactly one h1 exists on the page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  });

  test('the primary CTA targets the real signup/onboarding route', async ({ page }) => {
    await page.goto('/');
    const cta = page.getByRole('link', { name: 'Get started' }).first();
    await expect(cta).toHaveAttribute('href', '/signup');
  });

  test('sign-in targets the real login route', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Sign in' }).first()).toHaveAttribute(
      'href',
      '/login'
    );
  });

  test('every public nav link resolves to a real section id on the page', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Main' }).first();
    const hrefs = await nav
      .locator('a')
      .evaluateAll((els) => els.map((el) => (el as HTMLAnchorElement).getAttribute('href')));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href).not.toBeNull();
      expect(href).toMatch(/^#/);
      const id = href!.slice(1);
      await expect(page.locator(`#${id}`)).toHaveCount(1);
    }
    // The obsolete "Help" label from the raw design export must never
    // appear — no public Help route exists yet.
    await expect(nav.getByText('Help', { exact: true })).toHaveCount(0);
  });

  test('the product preview is visible and clearly marked as an example', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Your Inbox', { exact: true })).toBeVisible();
    await expect(page.getByText(/Example conversation/i).first()).toBeVisible();
  });

  test('makes no phone/voice/other-channel/statistic claims', async ({ page }) => {
    await page.goto('/');
    const bodyText = (await page.locator('body').innerText()).toLowerCase();
    for (const claim of FORBIDDEN_CLAIMS) {
      expect(bodyText).not.toContain(claim);
    }
  });

  test('never says "Your team picks up"', async ({ page }) => {
    await page.goto('/');
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('Your team picks up');
  });

  test('produces no browser console errors', async ({ page }) => {
    const pageConsole = captureConsoleText(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    expect(pageConsole.all()).toBe('');
  });

  const WIDTHS = [320, 390, 768, 1024, 1440];
  for (const width of WIDTHS) {
    test(`fits the viewport with no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await expectNoHorizontalOverflow(page);
    });
  }

  test('mobile navigation opens, closes, and stays keyboard accessible', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const menuButton = page.getByRole('button', { name: 'Open menu' });
    await expect(menuButton).toBeVisible();
    await menuButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Product' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('the mobile nav panel renders inside the Daylight scope, not stripped by the portal', async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();

    const insideScope = await page.evaluate(() => {
      const root = document.getElementById('daylight-marketing-root');
      const dialog = document.querySelector('[data-slot="sheet-content"]');
      return root && dialog ? root.contains(dialog) : false;
    });
    expect(insideScope).toBe(true);
  });

  test('remains usable with prefers-reduced-motion enabled', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('link', { name: 'Get started' })).toBeVisible();
  });
});

test.describe('/ does not weaken existing route protection', () => {
  test('/dashboard/overview still redirects a signed-out visitor to /login', async ({ page }) => {
    const response = await page.goto('/dashboard/overview');
    expect(response?.ok()).toBe(true);
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Foverview/);
  });

  test('/login and /signup still render their real, functioning forms', async ({ page }) => {
    // As of Milestone 3, /login and /signup are deliberately given their
    // own Daylight-scoped auth layout (see
    // src/features/auth/components/daylight/daylight-auth-shell.tsx), so
    // they legitimately do carry a `.daylight-marketing` ancestor now —
    // unlike the dashboard, which must never be Daylight-scoped. This
    // test keeps guarding the invariant that actually matters: the real
    // forms still render and still work, regardless of styling scope.
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();

    await page.goto('/signup');
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  });
});
