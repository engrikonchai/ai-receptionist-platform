import { describe, expect, it } from 'vitest';
import { DEFAULT_REDIRECT_PATH, isSafeInternalPath, resolveSafeNextPath } from './safe-redirect';

describe('isSafeInternalPath', () => {
  it('accepts a plain internal path', () => {
    expect(isSafeInternalPath('/dashboard/overview')).toBe(true);
  });

  it('accepts /reset-password — the password-recovery callback destination', () => {
    expect(isSafeInternalPath('/reset-password')).toBe(true);
  });

  it('rejects null, undefined and empty values', () => {
    expect(isSafeInternalPath(null)).toBe(false);
    expect(isSafeInternalPath(undefined)).toBe(false);
    expect(isSafeInternalPath('')).toBe(false);
  });

  it('rejects a path that does not start with /', () => {
    expect(isSafeInternalPath('dashboard')).toBe(false);
  });

  it('rejects an absolute external URL', () => {
    expect(isSafeInternalPath('https://evil.example/phish')).toBe(false);
    expect(isSafeInternalPath('http://evil.example')).toBe(false);
  });

  it('rejects a protocol-relative // redirect attack', () => {
    expect(isSafeInternalPath('//evil.example')).toBe(false);
    expect(isSafeInternalPath('//evil.example/reset-password')).toBe(false);
  });

  it('rejects a backslash-variant redirect attack some browsers normalize like //', () => {
    expect(isSafeInternalPath('/\\evil.example')).toBe(false);
  });

  it('rejects an embedded :// scheme anywhere in the path', () => {
    expect(isSafeInternalPath('/redirect?to=https://evil.example')).toBe(false);
  });
});

describe('resolveSafeNextPath', () => {
  it('returns the safe path unchanged when it is internal', () => {
    expect(resolveSafeNextPath('/reset-password')).toBe('/reset-password');
  });

  it('falls back to the default redirect path for an external URL', () => {
    expect(resolveSafeNextPath('https://evil.example')).toBe(DEFAULT_REDIRECT_PATH);
  });

  it('falls back to the default redirect path for a protocol-relative URL', () => {
    expect(resolveSafeNextPath('//evil.example')).toBe(DEFAULT_REDIRECT_PATH);
  });

  it('falls back to the default redirect path for a backslash-variant URL', () => {
    expect(resolveSafeNextPath('/\\evil.example')).toBe(DEFAULT_REDIRECT_PATH);
  });

  it('falls back to a caller-supplied fallback instead of the default when given one', () => {
    expect(resolveSafeNextPath('//evil.example', '/forgot-password')).toBe('/forgot-password');
  });

  it('falls back to the default for a missing value', () => {
    expect(resolveSafeNextPath(null)).toBe(DEFAULT_REDIRECT_PATH);
    expect(resolveSafeNextPath(undefined)).toBe(DEFAULT_REDIRECT_PATH);
  });
});
