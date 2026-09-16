// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ACTIVE_BUSINESS_COOKIE,
  clearActiveBusinessCookie,
  setActiveBusinessCookie
} from './active-business-cookie';

function readCookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`))
    ?.split('=')[1];
}

beforeEach(() => {
  // jsdom doesn't reset cookies between tests on its own.
  document.cookie = `${ACTIVE_BUSINESS_COOKIE}=; path=/; max-age=0`;
});

describe('setActiveBusinessCookie', () => {
  it('writes the business id under the shared cookie name', () => {
    setActiveBusinessCookie('biz-1');
    expect(readCookie(ACTIVE_BUSINESS_COOKIE)).toBe('biz-1');
  });

  it('overwrites a previously set business id when switching businesses', () => {
    setActiveBusinessCookie('biz-1');
    setActiveBusinessCookie('biz-2');
    expect(readCookie(ACTIVE_BUSINESS_COOKIE)).toBe('biz-2');
  });
});

describe('clearActiveBusinessCookie', () => {
  it('removes a previously set business id — the sign-out / account-switch guard', () => {
    setActiveBusinessCookie('biz-1');
    expect(readCookie(ACTIVE_BUSINESS_COOKIE)).toBe('biz-1');

    clearActiveBusinessCookie();

    expect(readCookie(ACTIVE_BUSINESS_COOKIE)).toBeUndefined();
  });

  it('is a no-op when no cookie was ever set', () => {
    expect(() => clearActiveBusinessCookie()).not.toThrow();
    expect(readCookie(ACTIVE_BUSINESS_COOKIE)).toBeUndefined();
  });
});
