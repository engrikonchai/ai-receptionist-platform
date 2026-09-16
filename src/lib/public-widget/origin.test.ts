import { describe, expect, it } from 'vitest';
import { corsHeadersFor, isOriginAllowed } from './origin';

describe('isOriginAllowed', () => {
  it('rejects when there is no Origin header at all', () => {
    expect(isOriginAllowed(null, ['example.com'])).toBe(false);
  });

  it('rejects every origin when the allow-list is empty — never "allow all" by default', () => {
    expect(isOriginAllowed('https://example.com', [])).toBe(false);
    expect(isOriginAllowed('https://anything-at-all.com', [])).toBe(false);
  });

  it('allows an origin whose hostname is in the allow-list', () => {
    expect(isOriginAllowed('https://example.com', ['example.com'])).toBe(true);
  });

  it('rejects an origin whose hostname is not in the allow-list', () => {
    expect(isOriginAllowed('https://not-allowed.com', ['example.com'])).toBe(false);
  });

  it('does not treat example.com and www.example.com as the same origin', () => {
    expect(isOriginAllowed('https://www.example.com', ['example.com'])).toBe(false);
    expect(isOriginAllowed('https://www.example.com', ['www.example.com'])).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(isOriginAllowed('https://Example.com', ['example.com'])).toBe(true);
  });

  it('matches localhost with a port against a stored "localhost:3000" entry', () => {
    expect(isOriginAllowed('http://localhost:3000', ['localhost:3000'])).toBe(true);
  });

  it('rejects a malformed Origin header instead of throwing', () => {
    expect(isOriginAllowed('not-a-url', ['example.com'])).toBe(false);
  });
});

describe('corsHeadersFor', () => {
  it('echoes back exactly the given origin, never a wildcard', () => {
    const headers = corsHeadersFor('https://example.com') as Record<string, string>;
    expect(headers['Access-Control-Allow-Origin']).toBe('https://example.com');
    expect(headers['Access-Control-Allow-Origin']).not.toBe('*');
  });
});
