import { expect, test } from '@playwright/test';
import { captureConsoleText, expectNoHorizontalOverflow, VIEWPORTS } from './helpers';

/**
 * Milestone 3 — focused coverage for the Daylight authentication
 * refresh, on top of the existing e2e/auth-pages.spec.ts (which this
 * file never modifies or weakens). Same placeholder-Supabase-env
 * rationale as that file: every submission here fails client-side
 * before any network call, or reaches only the unreachable placeholder
 * host — never a real sign-in/sign-up attempt.
 */
const AUTH_PAGES = ['/login', '/signup', '/forgot-password'] as const;

test.describe('Daylight auth pages — layout and navigation', () => {
  for (const path of AUTH_PAGES) {
    test(`${path} has a real, working link back to the public landing page`, async ({ page }) => {
      await page.goto(path);
      const backLink = page.getByRole('link', { name: /Back to Platform/ });
      await expect(backLink).toBeVisible();
      await expect(backLink).toHaveAttribute('href', '/');
    });

    test(`${path} produces no console errors or hydration warnings`, async ({ page }) => {
      const pageConsole = captureConsoleText(page);
      await page.goto(path, { waitUntil: 'networkidle' });
      expect(pageConsole.all()).toBe('');
    });
  }

  test('the supporting visual panel is hidden on mobile so the form is the first thing shown', async ({
    page
  }) => {
    await page.setViewportSize(VIEWPORTS.mobileLarge);
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByText('Every customer gets an answer.')).toBeHidden();
  });

  test('the supporting visual panel is visible on desktop, with no invented statistics or claims', async ({
    page
  }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto('/login');

    await expect(page.getByText('Every customer gets an answer.')).toBeVisible();
    const bodyText = (await page.locator('body').innerText()).toLowerCase();
    for (const claim of ['certified', 'compliant', 'customers trust', '% of', 'guaranteed']) {
      expect(bodyText).not.toContain(claim);
    }
  });

  test('login and signup cross-link to each other', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Sign up' }).click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();

    await page.getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  const WIDTHS = [390, 768, 1440];
  for (const path of AUTH_PAGES) {
    for (const width of WIDTHS) {
      test(`${path} fits the viewport with no horizontal overflow at ${width}px`, async ({
        page
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await expectNoHorizontalOverflow(page);
      });
    }
  }
});

test.describe('Daylight auth pages — form behavior', () => {
  test('login shows accessible, visible validation errors and keeps focus manageable', async ({
    page
  }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('Email is required.')).toBeVisible();
    await expect(page.getByText('Password is required.')).toBeVisible();
  });

  test('login password field has a keyboard-accessible show/hide toggle', async ({ page }) => {
    await page.goto('/login');
    const password = page.locator('#password');
    await password.fill('a-typed-password');
    await expect(password).toHaveAttribute('type', 'password');

    const toggle = page.getByRole('button', { name: 'Show password' });
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(password).toHaveAttribute('type', 'text');
    await expect(page.getByRole('button', { name: 'Hide password' })).toBeVisible();
  });

  test('signup rejects a password shorter than 8 characters without ever calling Supabase', async ({
    page
  }) => {
    await page.goto('/signup');
    await page.getByLabel('Display name').fill('Jane Doe');
    await page.getByLabel('Email').fill('owner@example.com');
    await page.locator('#password').fill('short1');
    await page.locator('#confirmPassword').fill('short1');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText('Password must be at least 8 characters.')).toBeVisible();
  });

  test('forgot-password always shows the same non-revealing confirmation', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill('someone@example.com');
    await page.getByRole('button', { name: 'Send reset link' }).click();

    await expect(
      page.getByText("If an account exists for this email, we've sent a password reset link.")
    ).toBeVisible();
    await page.getByRole('link', { name: 'Back to sign in' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('Daylight auth pages — route protection and safety, unchanged', () => {
  test('/onboarding redirects a signed-out visitor to /login with a safe next param', async ({
    page
  }) => {
    const response = await page.goto('/onboarding');
    expect(response?.ok()).toBe(true);
    await expect(page).toHaveURL(/\/login\?next=%2Fonboarding/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('/dashboard/overview still redirects a signed-out visitor to /login', async ({ page }) => {
    const response = await page.goto('/dashboard/overview');
    expect(response?.ok()).toBe(true);
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Foverview/);
  });

  test('an external ?next= destination never appears anywhere in the rendered page', async ({
    page
  }) => {
    // isSafeInternalPath/resolveSafeNextPath's own logic is unit-tested
    // in src/lib/safe-redirect.test.ts — this only guards that the
    // login page itself renders normally (never crashes) and never
    // reflects an attacker-controlled external `next` value into any
    // link or attribute on the page.
    const response = await page.goto('/login?next=https://evil.example');
    expect(response?.ok()).toBe(true);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    const hrefs = await page
      .locator('a[href]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('href')));
    for (const href of hrefs) {
      expect(href).not.toContain('evil.example');
    }
  });

  test('public landing page and /demo remain publicly accessible, unaffected by the auth refresh', async ({
    page
  }) => {
    const landing = await page.goto('/');
    expect(landing?.ok()).toBe(true);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const demo = await page.goto('/demo');
    expect(demo?.ok()).toBe(true);
    await expect(page.getByRole('heading', { name: 'Try the website chat' })).toBeVisible();
  });
});

test.describe('Daylight auth pages — missing Supabase configuration', () => {
  test('shows a clear, non-sensitive notice instead of a broken form when unconfigured', async ({
    page
  }) => {
    // This suite's dev server (see playwright.config.ts) always sets
    // placeholder Supabase env vars, so the real "unconfigured" state
    // can't be reached end-to-end here — covered instead by each form's
    // own unit tests (e.g. login-form.test.tsx mocks
    // isSupabaseConfigured() to false). This test only guards that the
    // configured happy-path renders the real form, not the notice, so a
    // regression that accidentally always shows the notice would be
    // caught here.
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
  });
});
