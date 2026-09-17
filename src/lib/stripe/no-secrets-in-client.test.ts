import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../../..');
const SECRET_ENV_NAMES = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];
const SECRET_VALUE_PATTERNS = [/sk_(test|live)_/, /whsec_/];

function listFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...listFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function listSourceFiles(dir: string): string[] {
  return listFiles(dir).filter(
    (f) => /\.(ts|tsx|js|jsx)$/.test(f) && !f.endsWith('.test.ts') && !f.endsWith('.test.tsx')
  );
}

describe('Stripe secrets never reach the browser', () => {
  it('never appears — as a literal env var name or a shaped secret value — anywhere under public/ (served verbatim to any visitor)', () => {
    const publicDir = path.join(PROJECT_ROOT, 'public');
    // Excludes co-located test files (e.g. public/widget-loader.test.ts)
    // — never served as a static asset, only ever run by vitest, and
    // may legitimately contain a look-alike secret string as its own
    // negative-test fixture data.
    const servedFiles = listFiles(publicDir).filter((f) => !/\.test\.(ts|tsx|js)$/.test(f));
    for (const file of servedFiles) {
      const content = readFileSync(file, 'utf8');
      for (const name of SECRET_ENV_NAMES) {
        expect(content).not.toContain(name);
      }
      for (const pattern of SECRET_VALUE_PATTERNS) {
        expect(content).not.toMatch(pattern);
      }
    }
  });

  it('is never referenced with a NEXT_PUBLIC_ prefix anywhere in src/ — that would inline it into the client bundle at build time', () => {
    for (const file of listSourceFiles(path.join(PROJECT_ROOT, 'src'))) {
      const content = readFileSync(file, 'utf8');
      expect(content).not.toMatch(/NEXT_PUBLIC_STRIPE/);
    }
  });

  it('next.config.ts never re-exposes a Stripe env var the way it does NEXT_PUBLIC_VERCEL_URL', () => {
    const content = readFileSync(path.join(PROJECT_ROOT, 'next.config.ts'), 'utf8');
    expect(content).not.toMatch(/STRIPE/);
  });

  it('the Stripe client module (src/lib/stripe/client.ts) is never imported by a "use client" component', () => {
    for (const file of listSourceFiles(path.join(PROJECT_ROOT, 'src'))) {
      if (file.endsWith(path.join('lib', 'stripe', 'client.ts'))) continue;
      const content = readFileSync(file, 'utf8');
      if (
        !content.trimStart().startsWith("'use client'") &&
        !content.trimStart().startsWith('"use client"')
      ) {
        continue;
      }
      expect(content).not.toMatch(/from ['"]@\/lib\/stripe\/client['"]/);
      expect(content).not.toMatch(/from ['"]stripe['"]/);
    }
  });

  it('.env.example documents the three Stripe variables as plain (never NEXT_PUBLIC_-prefixed) server secrets', () => {
    const content = readFileSync(path.join(PROJECT_ROOT, 'env.example.txt'), 'utf8');
    expect(content).toMatch(/^STRIPE_SECRET_KEY=/m);
    expect(content).toMatch(/^STRIPE_WEBHOOK_SECRET=/m);
    expect(content).toMatch(/^STRIPE_PRICE_ID=/m);
    expect(content).not.toMatch(/NEXT_PUBLIC_STRIPE/);
  });
});
