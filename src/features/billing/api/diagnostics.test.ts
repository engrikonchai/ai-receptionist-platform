import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@paddle/paddle-node-sdk';
import {
  CHECKOUT_DIAGNOSTIC_LOG_PREFIX,
  extractPaddleErrorDetails,
  logCheckoutDiagnostic
} from './diagnostics';

describe('logCheckoutDiagnostic', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('always logs with the exact prefix, and always includes the stage name', () => {
    logCheckoutDiagnostic('create_transaction');

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const [prefix, payload] = consoleErrorSpy.mock.calls[0]!;
    expect(prefix).toBe(CHECKOUT_DIAGNOSTIC_LOG_PREFIX);
    expect(JSON.parse(payload as string)).toEqual({ stage: 'create_transaction' });
  });

  it('includes only the safe fields that are actually present', () => {
    logCheckoutDiagnostic('resolve_customer', {
      paddleErrorCode: 'customer_already_exists',
      paddleErrorType: 'request_error'
    });

    const [, payload] = consoleErrorSpy.mock.calls[0]!;
    expect(JSON.parse(payload as string)).toEqual({
      stage: 'resolve_customer',
      paddleErrorCode: 'customer_already_exists',
      paddleErrorType: 'request_error'
    });
  });

  it('includes httpStatus and supabaseErrorCode when present', () => {
    logCheckoutDiagnostic('checkout_attempt_insert', {
      httpStatus: 503,
      supabaseErrorCode: '53300'
    });

    const [, payload] = consoleErrorSpy.mock.calls[0]!;
    expect(JSON.parse(payload as string)).toEqual({
      stage: 'checkout_attempt_insert',
      httpStatus: 503,
      supabaseErrorCode: '53300'
    });
  });

  it('never logs an arbitrary/unexpected field, even one deliberately smuggled in via the details object', () => {
    logCheckoutDiagnostic('create_transaction', {
      // @ts-expect-error — deliberately passing fields this function must ignore
      customerEmail: 'owner@example.com',
      businessId: 'biz-secret-1',
      paddleErrorCode: 'invalid_amount'
    });

    const [, payload] = consoleErrorSpy.mock.calls[0]!;
    const logged = JSON.parse(payload as string);
    expect(logged).toEqual({ stage: 'create_transaction', paddleErrorCode: 'invalid_amount' });
    expect(JSON.stringify(logged)).not.toContain('owner@example.com');
    expect(JSON.stringify(logged)).not.toContain('biz-secret-1');
  });

  it('silently drops non-string/non-number values for the typed fields instead of logging them', () => {
    logCheckoutDiagnostic('resolve_customer', {
      // @ts-expect-error — deliberately wrong type
      paddleErrorCode: { nested: 'object' },
      // @ts-expect-error — deliberately wrong type
      httpStatus: 'not-a-number'
    });

    const [, payload] = consoleErrorSpy.mock.calls[0]!;
    expect(JSON.parse(payload as string)).toEqual({ stage: 'resolve_customer' });
  });
});

describe('extractPaddleErrorDetails', () => {
  it('extracts only code/type from a Paddle ApiError — never its free-text detail', () => {
    const error = new ApiError(
      {
        type: 'request_error',
        code: 'customer_already_exists',
        detail: 'A customer with email owner@example.com already exists',
        documentation_url: 'https://developer.paddle.com/errors/customer_already_exists',
        errors: undefined
      },
      null
    );

    const details = extractPaddleErrorDetails(error);

    expect(details).toEqual({
      httpStatus: null,
      paddleErrorCode: 'customer_already_exists',
      paddleErrorType: 'request_error'
    });
    // The extractor's own return value must never carry the raw message —
    // even though the source ApiError obviously does.
    expect(JSON.stringify(details)).not.toContain('owner@example.com');
  });

  it('returns all nulls for a plain, non-Paddle error', () => {
    const details = extractPaddleErrorDetails(new Error('paddle down'));

    expect(details).toEqual({ httpStatus: null, paddleErrorCode: null, paddleErrorType: null });
  });

  it('returns all nulls for a non-object thrown value', () => {
    expect(extractPaddleErrorDetails('some string')).toEqual({
      httpStatus: null,
      paddleErrorCode: null,
      paddleErrorType: null
    });
    expect(extractPaddleErrorDetails(null)).toEqual({
      httpStatus: null,
      paddleErrorCode: null,
      paddleErrorType: null
    });
    expect(extractPaddleErrorDetails(undefined)).toEqual({
      httpStatus: null,
      paddleErrorCode: null,
      paddleErrorType: null
    });
  });

  it('picks up a numeric HTTP status from an error shape that carries one, defensively', () => {
    const errorLike = { status: 503, message: 'Service Unavailable' };

    expect(extractPaddleErrorDetails(errorLike)).toEqual({
      httpStatus: 503,
      paddleErrorCode: null,
      paddleErrorType: null
    });
  });

  it('never surfaces a non-numeric status field', () => {
    const errorLike = { status: 'unavailable' };

    expect(extractPaddleErrorDetails(errorLike).httpStatus).toBeNull();
  });
});
