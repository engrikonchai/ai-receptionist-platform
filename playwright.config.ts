import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Some environments pre-bake a Chromium build under `PLAYWRIGHT_BROWSERS_PATH`
 * (and skip `playwright install` entirely) with a `chromium` binary/symlink
 * that doesn't always match the exact revision this pinned `@playwright/test`
 * version would otherwise look for by itself. When that pre-baked binary
 * exists, use it directly instead of downloading; everywhere else (a normal
 * contributor machine, CI after `playwright install --with-deps chromium`)
 * this stays `undefined` and Playwright resolves the browser itself.
 */
const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
const preinstalledChromium = browsersPath ? path.join(browsersPath, 'chromium') : undefined;
const chromiumExecutablePath =
  preinstalledChromium && fs.existsSync(preinstalledChromium) ? preinstalledChromium : undefined;

/**
 * Deterministic, non-default port so this never collides with a `next
 * dev` instance a developer already has running on 3000.
 */
const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Loopback address nothing ever listens on. Handing these to the app in
 * place of real Supabase credentials makes `isSupabaseConfigured()`
 * return true (so auth forms render their real controls instead of the
 * "not configured" notice) while every `supabase-js` call this suite
 * can reach — `auth.getUser()` in `proxy.ts`/`dashboard/layout.tsx` —
 * fails instantly with a connection error instead of hanging on DNS or
 * hitting a real project. Confirmed locally: this makes
 * `/dashboard/overview` resolve to a fast, safe redirect to `/login`
 * rather than a hang, a 500, or the dev-only notice. Not a real
 * credential — never a Paddle/Supabase secret, and no test in this
 * suite performs a real sign-in/sign-up network call.
 */
const PLACEHOLDER_SUPABASE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:59999',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'playwright-e2e-placeholder-anon-key'
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {}
      }
    }
  ],
  webServer: {
    // A production build+start, not `next dev`: confirmed locally that
    // the dev server's Turbopack/HMR pipeline in some sandboxed
    // environments silently breaks client-side hydration (event
    // handlers never attach, so every interactive test — form submit,
    // the theme toggle — fails, even though the exact same code hydrates
    // and works normally with `next build && next start`). Production
    // mode is also the more representative target for a smoke suite.
    command: 'bun run build && bun run start',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PORT: String(PORT),
      ...PLACEHOLDER_SUPABASE_ENV
    }
  }
});
