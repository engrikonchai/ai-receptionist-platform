import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression coverage for the production incident this file's own
 * `compiler.removeConsole` comment documents: a bare
 * `removeConsole: true` (no `exclude`) silently strips console.error
 * too, erasing every safe diagnostic logger in this app
 * (src/lib/paddle/webhook-signature-diagnostics.ts,
 * src/features/billing/api/diagnostics.ts, the webhook route's own
 * ledger diagnostics, src/features/inbox/, src/lib/public-widget/) —
 * verified empirically against a real `next build` output, not
 * asserted from documentation alone. `NODE_ENV` is stubbed and the
 * module re-imported fresh each time, since `next.config.ts` computes
 * `removeConsole` once at module-evaluation time from
 * `process.env.NODE_ENV`.
 */
describe('next.config.ts — compiler.removeConsole never strips console.error', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('excludes "error" when NODE_ENV is production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();

    const { default: nextConfig } = await import('./next.config');

    expect(nextConfig.compiler?.removeConsole).toEqual({ exclude: ['error'] });
  });

  it('never uses a bare `true` in production — that strips console.error along with everything else', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();

    const { default: nextConfig } = await import('./next.config');

    expect(nextConfig.compiler?.removeConsole).not.toBe(true);
  });

  it('still strips console.log/warn/debug/info in production — only console.error is carved out', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();

    const { default: nextConfig } = await import('./next.config');
    const removeConsole = nextConfig.compiler?.removeConsole;

    expect(typeof removeConsole).toBe('object');
    if (typeof removeConsole === 'object' && removeConsole !== null) {
      expect(removeConsole.exclude).toEqual(['error']);
    }
  });

  it('removes no console output outside production', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.resetModules();

    const { default: nextConfig } = await import('./next.config');

    expect(nextConfig.compiler?.removeConsole).toBe(false);
  });
});
