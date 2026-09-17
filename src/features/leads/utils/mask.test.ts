import { describe, expect, it } from 'vitest';
import { maskContact } from './mask';

describe('maskContact', () => {
  it('masks an email keeping only the first character of the local part and domain name', () => {
    expect(maskContact('jane@example.com')).toBe('j•••@e•••.com');
  });

  it('masks a phone number keeping only the first two and last four characters', () => {
    expect(maskContact('+15551234567')).toBe('+1••••4567');
  });

  it('masks each part independently when both an email and a phone are present', () => {
    expect(maskContact('jane@example.com · +15551234567')).toBe('j•••@e•••.com · +1••••4567');
  });

  it('fully masks a short, non-email token instead of partially revealing it', () => {
    expect(maskContact('12345')).toBe('••••');
  });

  it('never includes the full raw contact string in its output', () => {
    const contact = 'jane.doe@business-secret.example · +15551234567';
    const masked = maskContact(contact);
    expect(masked).not.toContain(contact);
    expect(masked).not.toContain('jane.doe');
    expect(masked).not.toContain('15551234567');
  });

  it('masks an empty or whitespace-only contact without throwing', () => {
    expect(maskContact('')).toBe('••••');
    expect(maskContact('   ')).toBe('••••');
  });

  it('trims surrounding whitespace before masking', () => {
    expect(maskContact('  jane@example.com  ')).toBe('j•••@e•••.com');
  });
});
