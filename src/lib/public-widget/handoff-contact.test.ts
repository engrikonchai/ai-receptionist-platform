import { describe, expect, it } from 'vitest';
import {
  buildContactLine,
  isPlausibleEmail,
  isPlausiblePhone,
  sanitizeFreeText
} from './handoff-contact';

describe('isPlausibleEmail', () => {
  it('accepts a normal email', () => {
    expect(isPlausibleEmail('visitor@example.com')).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(isPlausibleEmail('')).toBe(false);
  });

  it('rejects an email missing a domain', () => {
    expect(isPlausibleEmail('visitor@')).toBe(false);
  });

  it('rejects an email with no @', () => {
    expect(isPlausibleEmail('visitor.example.com')).toBe(false);
  });

  it('rejects an email over 320 characters', () => {
    expect(isPlausibleEmail(`${'a'.repeat(310)}@example.com`)).toBe(false);
  });
});

describe('isPlausiblePhone', () => {
  it('accepts a plain international number', () => {
    expect(isPlausiblePhone('+15551234567')).toBe(true);
  });

  it('accepts a formatted number with spaces and parentheses', () => {
    expect(isPlausiblePhone('+1 (555) 123-4567')).toBe(true);
  });

  it('rejects a too-short number', () => {
    expect(isPlausiblePhone('12345')).toBe(false);
  });

  it('rejects letters', () => {
    expect(isPlausiblePhone('call-me-maybe')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isPlausiblePhone('')).toBe(false);
  });
});

describe('buildContactLine', () => {
  it('joins email and phone when both are present', () => {
    expect(buildContactLine('visitor@example.com', '+15551234567')).toBe(
      'visitor@example.com · +15551234567'
    );
  });

  it('returns just the email when phone is empty', () => {
    expect(buildContactLine('visitor@example.com', '')).toBe('visitor@example.com');
  });

  it('returns just the phone when email is empty', () => {
    expect(buildContactLine('', '+15551234567')).toBe('+15551234567');
  });
});

describe('sanitizeFreeText', () => {
  it('trims leading and trailing whitespace', () => {
    expect(sanitizeFreeText('  hello  ', 100)).toBe('hello');
  });

  it('strips control characters but keeps newlines and tabs', () => {
    const input = 'line one\nline\ttwo\x00\x1f';
    expect(sanitizeFreeText(input, 100)).toBe('line one\nline\ttwo');
  });

  it('strips zero-width characters', () => {
    expect(sanitizeFreeText('a​b‌c﻿d', 100)).toBe('abcd');
  });

  it('caps to the given maximum length', () => {
    expect(sanitizeFreeText('a'.repeat(50), 10)).toBe('a'.repeat(10));
  });
});
