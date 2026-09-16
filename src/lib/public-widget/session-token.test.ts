import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { issueWidgetSessionToken, verifyWidgetSessionToken } from './session-token';

const ORIGINAL_ENV = { ...process.env };

const CLAIMS = {
  publicWidgetId: 'widget-a',
  conversationId: 'conv-a-1',
  visitorId: 'visitor-1'
};

beforeEach(() => {
  process.env.WIDGET_SESSION_SECRET = 'test-secret-do-not-use-in-production';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.useRealTimers();
});

describe('issueWidgetSessionToken', () => {
  it('returns null when WIDGET_SESSION_SECRET is not configured — fails closed', () => {
    delete process.env.WIDGET_SESSION_SECRET;
    expect(issueWidgetSessionToken(CLAIMS)).toBeNull();
  });

  it('issues a token containing a payload and a signature separated by a dot', () => {
    const token = issueWidgetSessionToken(CLAIMS);
    expect(token).not.toBeNull();
    expect(token!.split('.')).toHaveLength(2);
  });
});

describe('verifyWidgetSessionToken', () => {
  it('accepts a token it just issued and returns the original claims', () => {
    const token = issueWidgetSessionToken(CLAIMS);
    const verified = verifyWidgetSessionToken(token);
    expect(verified).toEqual(CLAIMS);
  });

  it('never includes businessId in the decoded payload — the browser can read this payload, so it must never carry it', () => {
    const token = issueWidgetSessionToken(CLAIMS)!;
    const [payloadB64] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));

    expect(decoded).not.toHaveProperty('businessId');
    expect(decoded).not.toHaveProperty('business_id');
    expect(Object.keys(decoded).toSorted()).toEqual(
      ['conversationId', 'exp', 'iat', 'publicWidgetId', 'visitorId'].toSorted()
    );
  });

  it('rejects a token with no signature at all', () => {
    expect(verifyWidgetSessionToken('not-a-token')).toBeNull();
  });

  it('rejects null/undefined', () => {
    expect(verifyWidgetSessionToken(null)).toBeNull();
    expect(verifyWidgetSessionToken(undefined)).toBeNull();
  });

  it('rejects a token when WIDGET_SESSION_SECRET is not configured — fails closed', () => {
    const token = issueWidgetSessionToken(CLAIMS);
    delete process.env.WIDGET_SESSION_SECRET;
    expect(verifyWidgetSessionToken(token)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const token = issueWidgetSessionToken(CLAIMS);
    process.env.WIDGET_SESSION_SECRET = 'a-completely-different-secret';
    expect(verifyWidgetSessionToken(token)).toBeNull();
  });

  it('rejects a token whose payload has been tampered with (modified conversationId), even though the signature string is unchanged', () => {
    const token = issueWidgetSessionToken(CLAIMS)!;
    const [payloadB64, signatureB64] = token.split('.');
    const tamperedPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    tamperedPayload.conversationId = 'conv-b-1';
    const tamperedPayloadB64 = Buffer.from(JSON.stringify(tamperedPayload), 'utf8').toString(
      'base64url'
    );
    const tamperedToken = `${tamperedPayloadB64}.${signatureB64}`;

    expect(verifyWidgetSessionToken(tamperedToken)).toBeNull();
  });

  it('rejects a token with a tampered signature', () => {
    const token = issueWidgetSessionToken(CLAIMS)!;
    const [payloadB64] = token.split('.');
    const tamperedToken = `${payloadB64}.${'A'.repeat(43)}`;

    expect(verifyWidgetSessionToken(tamperedToken)).toBeNull();
  });

  it('rejects an expired token', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const token = issueWidgetSessionToken(CLAIMS);

    vi.setSystemTime((4 * 60 * 60 + 1) * 1000); // just past the 4-hour TTL
    expect(verifyWidgetSessionToken(token)).toBeNull();
  });

  it('accepts a token right before it expires', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const token = issueWidgetSessionToken(CLAIMS);

    vi.setSystemTime((4 * 60 * 60 - 1) * 1000);
    expect(verifyWidgetSessionToken(token)).toEqual(CLAIMS);
  });

  it('rejects malformed base64 payload/signature segments instead of throwing', () => {
    expect(verifyWidgetSessionToken('not-base64-at-all.also-not-base64')).toBeNull();
    expect(verifyWidgetSessionToken('.')).toBeNull();
    expect(verifyWidgetSessionToken('abc.')).toBeNull();
    expect(verifyWidgetSessionToken('.abc')).toBeNull();
  });

  it('rejects a payload that is valid base64 but not valid JSON', () => {
    const garbage = Buffer.from('not json', 'utf8').toString('base64url');
    expect(verifyWidgetSessionToken(`${garbage}.${'A'.repeat(43)}`)).toBeNull();
  });

  it('rejects a payload missing a required claim', () => {
    const secret = process.env.WIDGET_SESSION_SECRET!;
    const incomplete = { publicWidgetId: 'widget-a', conversationId: 'conv-a-1' };
    const payloadB64 = Buffer.from(JSON.stringify(incomplete), 'utf8').toString('base64url');
    const signatureB64 = createHmac('sha256', secret).update(payloadB64).digest('base64url');

    expect(verifyWidgetSessionToken(`${payloadB64}.${signatureB64}`)).toBeNull();
  });

  it('rejects a payload that includes a forged businessId claim alongside the real ones — extra fields never get trusted back in', () => {
    const secret = process.env.WIDGET_SESSION_SECRET!;
    const withForgedBusinessId = {
      ...CLAIMS,
      businessId: 'business-forged',
      iat: 0,
      exp: 9_999_999_999
    };
    const payloadB64 = Buffer.from(JSON.stringify(withForgedBusinessId), 'utf8').toString(
      'base64url'
    );
    const signatureB64 = createHmac('sha256', secret).update(payloadB64).digest('base64url');

    const verified = verifyWidgetSessionToken(`${payloadB64}.${signatureB64}`);
    expect(verified).not.toBeNull();
    expect(verified).not.toHaveProperty('businessId');
    expect(verified).toEqual(CLAIMS);
  });
});
