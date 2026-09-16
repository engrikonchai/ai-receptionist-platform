import { describe, expect, it } from 'vitest';
import { corsHeadersFor, isOriginAllowed, normalizeOrigin } from './origin';

describe('normalizeOrigin', () => {
  it('defaults a bare hostname to https://', () => {
    expect(normalizeOrigin('example.com')).toBe('https://example.com');
  });

  it('preserves an explicit http:// scheme (e.g. for local testing)', () => {
    expect(normalizeOrigin('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('lowercases the hostname and scheme', () => {
    expect(normalizeOrigin('HTTPS://Example.COM')).toBe('https://example.com');
  });

  it('preserves a non-default port', () => {
    expect(normalizeOrigin('example.com:8443')).toBe('https://example.com:8443');
  });

  it('accepts localhost and bare IP hosts', () => {
    expect(normalizeOrigin('localhost')).toBe('https://localhost');
    expect(normalizeOrigin('127.0.0.1')).toBe('https://127.0.0.1');
  });

  it('rejects a path', () => {
    expect(normalizeOrigin('example.com/some/path')).toBeNull();
    expect(normalizeOrigin('https://example.com/')).toBe('https://example.com');
  });

  it('rejects a query string or fragment', () => {
    expect(normalizeOrigin('example.com?x=1')).toBeNull();
    expect(normalizeOrigin('example.com#section')).toBeNull();
  });

  it('rejects embedded credentials', () => {
    expect(normalizeOrigin('https://user:pass@example.com')).toBeNull();
  });

  it('rejects a wildcard', () => {
    expect(normalizeOrigin('*')).toBeNull();
    expect(normalizeOrigin('*.example.com')).toBeNull();
  });

  it('rejects a non-http(s) scheme', () => {
    expect(normalizeOrigin('ftp://example.com')).toBeNull();
    expect(normalizeOrigin('javascript://example.com')).toBeNull();
  });

  it('rejects malformed input instead of throwing', () => {
    expect(normalizeOrigin('not a url at all')).toBeNull();
    expect(normalizeOrigin('')).toBeNull();
    expect(normalizeOrigin('   ')).toBeNull();
  });

  it('rejects a hostname with no dot that is not localhost or an IP', () => {
    expect(normalizeOrigin('example')).toBeNull();
  });
});

describe('isOriginAllowed', () => {
  it('rejects when there is no Origin header at all', () => {
    expect(isOriginAllowed(null, ['https://example.com'])).toBe(false);
  });

  it('rejects every origin when the allow-list is empty — never "allow all" by default', () => {
    expect(isOriginAllowed('https://example.com', [])).toBe(false);
    expect(isOriginAllowed('https://anything-at-all.com', [])).toBe(false);
  });

  it('allows an origin that normalizes to an entry in the allow-list', () => {
    expect(isOriginAllowed('https://example.com', ['https://example.com'])).toBe(true);
  });

  it('rejects an origin not in the allow-list', () => {
    expect(isOriginAllowed('https://not-allowed.com', ['https://example.com'])).toBe(false);
  });

  it('does not treat example.com and www.example.com as the same origin', () => {
    expect(isOriginAllowed('https://www.example.com', ['https://example.com'])).toBe(false);
    expect(isOriginAllowed('https://www.example.com', ['https://www.example.com'])).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(isOriginAllowed('https://Example.com', ['https://example.com'])).toBe(true);
  });

  it('treats different ports as different origins', () => {
    expect(isOriginAllowed('http://localhost:3000', ['http://localhost:4000'])).toBe(false);
    expect(isOriginAllowed('http://localhost:3000', ['http://localhost:3000'])).toBe(true);
  });

  it('treats different schemes as different origins', () => {
    expect(isOriginAllowed('http://example.com', ['https://example.com'])).toBe(false);
  });

  it('rejects a malformed Origin header instead of throwing', () => {
    expect(isOriginAllowed('not-a-url', ['https://example.com'])).toBe(false);
  });
});

describe('corsHeadersFor', () => {
  it('echoes back exactly the given origin, never a wildcard', () => {
    const headers = corsHeadersFor('https://example.com') as Record<string, string>;
    expect(headers['Access-Control-Allow-Origin']).toBe('https://example.com');
    expect(headers['Access-Control-Allow-Origin']).not.toBe('*');
  });
});
