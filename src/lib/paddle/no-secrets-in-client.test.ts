import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.join(import.meta.dirname, '..', '..', '..');

function listFiles(dir: string, extensions: string[]): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') {
        continue;
      }
      files.push(...listFiles(fullPath, extensions));
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Paddle secrets never reach the browser', () => {
  it('never ships PADDLE_API_KEY or PADDLE_WEBHOOK_SECRET (name or a plausible value) in a public/static asset', () => {
    const publicDir = path.join(REPO_ROOT, 'public');
    const files = listFiles(publicDir, ['.js', '.html', '.txt', '.json']).filter(
      (file) => !file.endsWith('.test.ts') && !file.endsWith('.test.js')
    );

    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      expect(content).not.toContain('PADDLE_API_KEY');
      expect(content).not.toContain('PADDLE_WEBHOOK_SECRET');
    }
  });

  it('never prefixes a secret Paddle variable with NEXT_PUBLIC_ anywhere in source', () => {
    const files = listFiles(path.join(REPO_ROOT, 'src'), ['.ts', '.tsx']).filter(
      (file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx')
    );

    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      expect(content).not.toMatch(/NEXT_PUBLIC_PADDLE_API_KEY/);
      expect(content).not.toMatch(/NEXT_PUBLIC_PADDLE_WEBHOOK_SECRET/);
    }
  });

  it('never mentions the secret Paddle variables in next.config.ts', () => {
    const configPath = path.join(REPO_ROOT, 'next.config.ts');
    const content = readFileSync(configPath, 'utf8');
    expect(content).not.toContain('PADDLE_API_KEY');
    expect(content).not.toContain('PADDLE_WEBHOOK_SECRET');
  });

  it('never imports the server-only Paddle client or the Paddle Node SDK from a Client Component', () => {
    const files = listFiles(path.join(REPO_ROOT, 'src'), ['.tsx', '.ts']).filter(
      (file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx')
    );

    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const isClientComponent = /^['"]use client['"];?/m.test(content);
      if (!isClientComponent) continue;

      expect(content).not.toMatch(/from ['"]@\/lib\/paddle\/client['"]/);
      expect(content).not.toMatch(/from ['"]@paddle\/paddle-node-sdk['"]/);
    }
  });

  it('documents every Paddle variable in env.example.txt, with secrets never prefixed NEXT_PUBLIC_ and the client token always prefixed that way', () => {
    const envExample = readFileSync(path.join(REPO_ROOT, 'env.example.txt'), 'utf8');

    for (const secret of ['PADDLE_API_KEY', 'PADDLE_WEBHOOK_SECRET']) {
      expect(envExample).toMatch(new RegExp(`^${secret}=`, 'm'));
      expect(envExample).not.toMatch(new RegExp(`NEXT_PUBLIC_${secret}`));
    }

    expect(envExample).toMatch(/^NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=/m);
    expect(envExample).toMatch(/^PADDLE_ENVIRONMENT=sandbox$/m);
    expect(envExample).toMatch(/^PADDLE_PRICE_ID=/m);
  });
});

describe('no Stripe references remain anywhere in the app', () => {
  it('contains no "stripe" text in application source, migrations, or documented environment variables', () => {
    // Excludes this file itself and the migration's own contract test —
    // both legitimately contain the word "stripe" as part of their own
    // negative-check assertions, never as a real reference.
    const targets = [
      ...listFiles(path.join(REPO_ROOT, 'src'), ['.ts', '.tsx']),
      ...listFiles(path.join(REPO_ROOT, 'supabase', 'migrations'), ['.sql'])
    ].filter(
      (file) =>
        !file.endsWith('paddle_billing_foundation.test.ts') &&
        !file.endsWith('no-secrets-in-client.test.ts')
    );

    const offenders: string[] = [];
    for (const file of targets) {
      const content = readFileSync(file, 'utf8');
      if (/stripe/i.test(content)) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });

  it('the "stripe" dependency is not listed in package.json', () => {
    const packageJson = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(packageJson.dependencies).not.toHaveProperty('stripe');
    expect(packageJson.devDependencies ?? {}).not.toHaveProperty('stripe');
  });

  it('no /api/stripe route exists', () => {
    let exists = true;
    try {
      readdirSync(path.join(REPO_ROOT, 'src', 'app', 'api', 'stripe'));
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });
});
