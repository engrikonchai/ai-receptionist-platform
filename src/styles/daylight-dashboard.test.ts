import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A plain text-level regression test for the dashboard shell's token
 * values — jsdom doesn't load real stylesheets, so there's no way to
 * assert computed styles here; this instead guards the two things a
 * silent regression could actually break: the scope stays isolated
 * (never touches `:root`/`[data-theme='zen']` directly, never reuses
 * `.daylight-marketing`), and light/dark actually define different
 * values for every core token, never a pure-black dark canvas. Real
 * rendered-pixel verification is manual/Playwright — see
 * docs/daylight-design-system.md "Dashboard shell" section.
 */
const css = readFileSync(join(__dirname, 'daylight-dashboard.css'), 'utf-8');
// Doc comments reference `:root`/`[data-theme='zen']`/`.daylight-marketing`
// in prose (explaining what this file deliberately does NOT touch) — the
// selector-level assertions below only care about actual rules, so strip
// comments first rather than banning those substrings outright.
const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('daylight-dashboard.css', () => {
  it("scopes every rule to .daylight-dashboard, never :root or [data-theme='zen'] directly", () => {
    expect(cssWithoutComments).toContain('.daylight-dashboard {');
    expect(cssWithoutComments).toContain('.dark .daylight-dashboard {');
    expect(cssWithoutComments).not.toMatch(/^:root\s*{/m);
    expect(cssWithoutComments).not.toContain("[data-theme='zen']");
  });

  it('never reuses the .daylight-marketing selector — a separate scope from the marketing/auth surfaces', () => {
    expect(cssWithoutComments).not.toContain('daylight-marketing');
  });

  it('gives light and dark different values for every core shadcn token', () => {
    const CORE_TOKENS = [
      '--background',
      '--foreground',
      '--card',
      '--primary',
      '--border',
      '--sidebar',
      '--sidebar-accent'
    ];
    const [lightBlock, darkBlock] = cssWithoutComments.split('.dark .daylight-dashboard');

    for (const token of CORE_TOKENS) {
      const lightMatch = lightBlock.match(new RegExp(`${token}:\\s*(#[0-9a-f]{3,8})`, 'i'));
      const darkMatch = darkBlock.match(new RegExp(`${token}:\\s*(#[0-9a-f]{3,8})`, 'i'));
      expect(lightMatch, `${token} missing a light value`).not.toBeNull();
      expect(darkMatch, `${token} missing a dark value`).not.toBeNull();
      expect(darkMatch![1].toLowerCase()).not.toBe(lightMatch![1].toLowerCase());
    }
  });

  it('never uses pure black or pure white for the dark canvas/surface — a calm dark navy instead', () => {
    const [, darkBlock] = cssWithoutComments.split('.dark .daylight-dashboard');
    const backgroundMatch = darkBlock.match(/--background:\s*(#[0-9a-f]{3,8})/i);
    const cardMatch = darkBlock.match(/--card:\s*(#[0-9a-f]{3,8})/i);

    expect(backgroundMatch![1].toLowerCase()).not.toBe('#000000');
    expect(backgroundMatch![1].toLowerCase()).not.toBe('#ffffff');
    expect(cardMatch![1].toLowerCase()).not.toBe('#000000');
    expect(cardMatch![1].toLowerCase()).not.toBe('#ffffff');
  });
});
