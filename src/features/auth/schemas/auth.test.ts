import { describe, expect, it } from 'vitest';
import { forgotPasswordSchema, resetPasswordSchema } from './auth';

describe('forgotPasswordSchema', () => {
  it('accepts a valid email', () => {
    const result = forgotPasswordSchema.safeParse({ email: 'owner@example.com' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = forgotPasswordSchema.safeParse({ email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty email', () => {
    const result = forgotPasswordSchema.safeParse({ email: '' });
    expect(result.success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('accepts matching passwords of at least 8 characters', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'longenough1',
      confirmPassword: 'longenough1'
    });
    expect(result.success).toBe(true);
  });

  it('rejects a password shorter than 8 characters', () => {
    const result = resetPasswordSchema.safeParse({ password: 'short1', confirmPassword: 'short1' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Password must be at least 8 characters.');
    }
  });

  it('rejects mismatched passwords', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'longenough1',
      confirmPassword: 'longenough2'
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const confirmIssue = result.error.issues.find((issue) =>
        issue.path.includes('confirmPassword')
      );
      expect(confirmIssue?.message).toBe('Passwords do not match.');
    }
  });
});
