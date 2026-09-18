import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WEBHOOK_SIGNATURE_DIAGNOSTIC_LOG_PREFIX,
  classifyWebhookVerificationFailure,
  logWebhookSignatureFailure
} from './webhook-signature-diagnostics';

/**
 * Every classification below is exercised against the EXACT thrown
 * values the installed `@paddle/paddle-node-sdk` produces — verified
 * by reading its source directly (see webhook-signature-diagnostics.ts's
 * own doc comment for the exact files/line behavior). These are not
 * invented error shapes.
 */
describe('classifyWebhookVerificationFailure', () => {
  it("classifies a malformed header — the SDK's own extractHeader() message, verbatim", () => {
    const error = new Error('[Paddle] Invalid webhook signature');

    const result = classifyWebhookVerificationFailure(error, 'garbage-header-no-ts-or-h1');

    expect(result).toEqual({ reason: 'malformed_signature_header', ageSeconds: null });
  });

  it('classifies a stale timestamp — header parses fine, but ts is more than 5 seconds old', () => {
    const error = new Error('[Paddle] Webhook signature verification failed');
    const staleTs = Math.floor(Date.now() / 1000) - 3600; // one hour old

    const result = classifyWebhookVerificationFailure(error, `ts=${staleTs};h1=deadbeef`);

    expect(result.reason).toBe('timestamp_rejected');
    expect(result.ageSeconds).toBeGreaterThan(5);
  });

  it('classifies a signature mismatch — header parses fine, timestamp is fresh, so the HMAC comparison itself must have failed', () => {
    const error = new Error('[Paddle] Webhook signature verification failed');
    const freshTs = Math.floor(Date.now() / 1000);

    const result = classifyWebhookVerificationFailure(error, `ts=${freshTs};h1=deadbeef`);

    expect(result.reason).toBe('signature_mismatch');
    expect(result.ageSeconds).toBeLessThanOrEqual(5);
  });

  it("treats exactly the 5-second boundary as still valid (matching the SDK's own strictly-greater-than comparison)", () => {
    const error = new Error('[Paddle] Webhook signature verification failed');
    const boundaryTs = Math.floor(Date.now() / 1000) - 5;

    const result = classifyWebhookVerificationFailure(error, `ts=${boundaryTs};h1=deadbeef`);

    expect(result.reason).toBe('signature_mismatch');
  });

  it('classifies a JSON parse failure — a genuinely valid signature over a non-JSON body', () => {
    const error = new SyntaxError('Unexpected token in JSON');

    const result = classifyWebhookVerificationFailure(error, 'ts=123;h1=deadbeef');

    expect(result).toEqual({ reason: 'event_parse_failed', ageSeconds: null });
  });

  it('never mistakes a JSON parse failure for a signature verification failure, even if both extend Error', () => {
    const error = new SyntaxError('[Paddle] Webhook signature verification failed');

    const result = classifyWebhookVerificationFailure(
      error,
      `ts=${Math.floor(Date.now() / 1000)};h1=x`
    );

    expect(result.reason).toBe('event_parse_failed');
  });

  it('classifies an unrecognized Error message as unknown, never guessing a specific cause', () => {
    const error = new Error('some future SDK message this module has never seen');

    const result = classifyWebhookVerificationFailure(error, 'ts=123;h1=deadbeef');

    expect(result).toEqual({ reason: 'unknown_verification_failure', ageSeconds: null });
  });

  it('classifies a non-Error thrown value as unknown', () => {
    expect(classifyWebhookVerificationFailure('a plain string', 'ts=123;h1=x')).toEqual({
      reason: 'unknown_verification_failure',
      ageSeconds: null
    });
    expect(classifyWebhookVerificationFailure(null, 'ts=123;h1=x')).toEqual({
      reason: 'unknown_verification_failure',
      ageSeconds: null
    });
  });

  it('falls back to unknown if the "verification failed" message somehow arrives with an unparseable ts', () => {
    const error = new Error('[Paddle] Webhook signature verification failed');

    const result = classifyWebhookVerificationFailure(error, 'ts=;h1=deadbeef');

    expect(result).toEqual({ reason: 'unknown_verification_failure', ageSeconds: null });
  });
});

describe('logWebhookSignatureFailure', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('logs with the exact prefix, plus only the reason when ageSeconds is unknown', () => {
    logWebhookSignatureFailure({ reason: 'malformed_signature_header', ageSeconds: null });

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const [prefix, payload] = consoleErrorSpy.mock.calls[0]!;
    expect(prefix).toBe(WEBHOOK_SIGNATURE_DIAGNOSTIC_LOG_PREFIX);
    expect(JSON.parse(payload as string)).toEqual({ reason: 'malformed_signature_header' });
  });

  it('includes ageSeconds when present', () => {
    logWebhookSignatureFailure({ reason: 'timestamp_rejected', ageSeconds: 3600 });

    const [, payload] = consoleErrorSpy.mock.calls[0]!;
    expect(JSON.parse(payload as string)).toEqual({
      reason: 'timestamp_rejected',
      ageSeconds: 3600
    });
  });

  it('never logs the signature header, a raw body, or any other field beyond reason/ageSeconds', () => {
    logWebhookSignatureFailure({ reason: 'signature_mismatch', ageSeconds: 1 });

    const allLoggedText = consoleErrorSpy.mock.calls
      .map((call: unknown[]) =>
        call.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ')
      )
      .join('\n');

    expect(allLoggedText).not.toContain('h1=');
    expect(allLoggedText).not.toContain('ts=');
    const [, payload] = consoleErrorSpy.mock.calls[0]!;
    expect(Object.keys(JSON.parse(payload as string)).toSorted()).toEqual(['ageSeconds', 'reason']);
  });
});
