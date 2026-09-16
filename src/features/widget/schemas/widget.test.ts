import { describe, expect, it } from 'vitest';
import { describeInvalidOrigin, widgetSettingsSchema } from './widget';

const baseValues = {
  enabled: true,
  assistantName: 'Adria Assistant',
  welcomeMessageEn: 'How can we help?',
  welcomeMessageMe: '',
  welcomeMessageRu: '',
  primaryColor: '#1677ff',
  position: 'bottom-right' as const,
  supportedLanguages: ['en'],
  humanHandoffEnabled: false,
  handoffEmail: '',
  allowedOrigins: ['example.com']
};

describe('widgetSettingsSchema — required fields', () => {
  it('accepts valid values with the default-language welcome message filled in', () => {
    const result = widgetSettingsSchema('en').safeParse(baseValues);
    expect(result.success).toBe(true);
  });

  it('rejects an empty assistant name', () => {
    const result = widgetSettingsSchema('en').safeParse({ ...baseValues, assistantName: '   ' });
    expect(result.success).toBe(false);
  });

  it('requires the default-language welcome message — English default, English blank', () => {
    const result = widgetSettingsSchema('en').safeParse({ ...baseValues, welcomeMessageEn: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('welcomeMessageEn'));
      expect(issue?.message).toBe('A welcome message in the default language is required.');
    }
  });

  it('requires the default-language welcome message — Montenegrin default, Montenegrin blank even though English is filled', () => {
    const result = widgetSettingsSchema('me').safeParse({ ...baseValues, welcomeMessageMe: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('welcomeMessageMe'))).toBe(true);
    }
  });

  it('rejects an invalid hex colour', () => {
    const result = widgetSettingsSchema('en').safeParse({ ...baseValues, primaryColor: 'blue' });
    expect(result.success).toBe(false);
  });

  it('accepts a 3-digit hex colour', () => {
    const result = widgetSettingsSchema('en').safeParse({ ...baseValues, primaryColor: '#fff' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid position', () => {
    const result = widgetSettingsSchema('en').safeParse({ ...baseValues, position: 'top-left' });
    expect(result.success).toBe(false);
  });

  it('requires at least one supported language', () => {
    const result = widgetSettingsSchema('en').safeParse({ ...baseValues, supportedLanguages: [] });
    expect(result.success).toBe(false);
  });
});

describe('widgetSettingsSchema — human handoff', () => {
  it('requires a handoff email when human handoff is enabled', () => {
    const result = widgetSettingsSchema('en').safeParse({
      ...baseValues,
      humanHandoffEnabled: true,
      handoffEmail: ''
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('handoffEmail'))).toBe(true);
    }
  });

  it('accepts an empty handoff email when human handoff is disabled', () => {
    const result = widgetSettingsSchema('en').safeParse({
      ...baseValues,
      humanHandoffEnabled: false,
      handoffEmail: ''
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid handoff email even when non-empty', () => {
    const result = widgetSettingsSchema('en').safeParse({
      ...baseValues,
      humanHandoffEnabled: true,
      handoffEmail: 'not-an-email'
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid handoff email when human handoff is enabled', () => {
    const result = widgetSettingsSchema('en').safeParse({
      ...baseValues,
      humanHandoffEnabled: true,
      handoffEmail: 'owner@example.com'
    });
    expect(result.success).toBe(true);
  });
});

describe('widgetSettingsSchema — allowed origins', () => {
  it('accepts an empty allow-list (widget just not embeddable anywhere yet)', () => {
    const result = widgetSettingsSchema('en').safeParse({ ...baseValues, allowedOrigins: [] });
    expect(result.success).toBe(true);
  });

  it('accepts a bare domain and normalizes it to a full https:// origin', () => {
    const result = widgetSettingsSchema('en').safeParse({
      ...baseValues,
      allowedOrigins: ['www.example.com']
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.allowedOrigins).toEqual(['https://www.example.com']);
    }
  });

  it('accepts an entry that already includes a scheme and keeps it', () => {
    const result = widgetSettingsSchema('en').safeParse({
      ...baseValues,
      allowedOrigins: ['https://example.com']
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.allowedOrigins).toEqual(['https://example.com']);
    }
  });

  it('rejects an obviously invalid domain', () => {
    const result = widgetSettingsSchema('en').safeParse({
      ...baseValues,
      allowedOrigins: ['not a domain']
    });
    expect(result.success).toBe(false);
  });

  it('rejects an entry with a path, query, or credentials', () => {
    expect(
      widgetSettingsSchema('en').safeParse({
        ...baseValues,
        allowedOrigins: ['example.com/some/path']
      }).success
    ).toBe(false);
    expect(
      widgetSettingsSchema('en').safeParse({
        ...baseValues,
        allowedOrigins: ['https://user:pass@example.com']
      }).success
    ).toBe(false);
  });

  it('gives a path-specific error message, distinct from the generic invalid-origin message, when the entry has a path', () => {
    const result = widgetSettingsSchema('en').safeParse({
      ...baseValues,
      allowedOrigins: ['example.com/about']
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('allowedOrigins'));
      expect(issue?.message).toBe(
        'Enter just the origin, without a path — e.g. https://example.com, not https://example.com/about.'
      );
    }
  });

  it('rejects a wildcard entry', () => {
    const result = widgetSettingsSchema('en').safeParse({
      ...baseValues,
      allowedOrigins: ['*.example.com']
    });
    expect(result.success).toBe(false);
  });

  it('accepts localhost with a port, for local testing, and normalizes it', () => {
    const result = widgetSettingsSchema('en').safeParse({
      ...baseValues,
      allowedOrigins: ['localhost:3000']
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.allowedOrigins).toEqual(['https://localhost:3000']);
    }
  });
});

describe('describeInvalidOrigin — the same messages the TagsField uses for immediate, add-time feedback', () => {
  it('returns null for a valid bare domain or full origin', () => {
    expect(describeInvalidOrigin('example.com')).toBeNull();
    expect(describeInvalidOrigin('https://example.com')).toBeNull();
  });

  it('flags a path specifically, distinct from other invalid-origin reasons', () => {
    expect(describeInvalidOrigin('example.com/about')).toBe(
      'Enter just the origin, without a path — e.g. https://example.com, not https://example.com/about.'
    );
    expect(describeInvalidOrigin('https://example.com/about')).toBe(
      'Enter just the origin, without a path — e.g. https://example.com, not https://example.com/about.'
    );
  });

  it('flags a query string or fragment the same way as a path', () => {
    expect(describeInvalidOrigin('example.com?x=1')).toBe(
      'Enter just the origin, without a path — e.g. https://example.com, not https://example.com/about.'
    );
    expect(describeInvalidOrigin('example.com#section')).toBe(
      'Enter just the origin, without a path — e.g. https://example.com, not https://example.com/about.'
    );
  });

  it('gives the generic message for a malformed domain that has no path', () => {
    expect(describeInvalidOrigin('not a domain')).toBe(
      'Enter a valid website origin, e.g. https://example.com.'
    );
  });

  it('gives the empty-input message for a blank entry', () => {
    expect(describeInvalidOrigin('')).toBe('Enter a domain.');
    expect(describeInvalidOrigin('   ')).toBe('Enter a domain.');
  });

  it('gives the length message for an overly long entry', () => {
    expect(describeInvalidOrigin(`https://${'a'.repeat(250)}.com`)).toBe(
      'Keep it under 253 characters.'
    );
  });
});
