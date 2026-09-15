import { describe, expect, it } from 'vitest';
import { maskVisitorId, neutralVisitorName } from './mask';

describe('maskVisitorId', () => {
  it('shows only the first two and last four characters of a long id', () => {
    expect(maskVisitorId('abcdefghij1234')).toBe('ab••••1234');
  });

  it('fully masks a short id instead of partially revealing it', () => {
    expect(maskVisitorId('abcdef')).toBe('••••');
    expect(maskVisitorId('ab')).toBe('••••');
    expect(maskVisitorId('')).toBe('••••');
  });

  it('trims surrounding whitespace before masking', () => {
    expect(maskVisitorId('  abcdefghij1234  ')).toBe('ab••••1234');
  });

  it('never includes the full raw id in its output', () => {
    const visitorId = 'visitor-secret-uuid-9f8e7d6c';
    expect(maskVisitorId(visitorId)).not.toContain(visitorId);
  });
});

describe('neutralVisitorName', () => {
  it('combines the channel label with the masked visitor id', () => {
    expect(neutralVisitorName('website', 'abcdefghij1234')).toBe('Website visitor ab••••1234');
    expect(neutralVisitorName('instagram', 'xyz')).toBe('Instagram visitor ••••');
    expect(neutralVisitorName('whatsapp', 'abcdefghij1234')).toBe('WhatsApp visitor ab••••1234');
  });
});
