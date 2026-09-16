import { describe, expect, it } from 'vitest';
import { widgetSettingsSchema } from './widget';

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

  it('accepts a bare domain', () => {
    const result = widgetSettingsSchema('en').safeParse({
      ...baseValues,
      allowedOrigins: ['www.example.com']
    });
    expect(result.success).toBe(true);
  });

  it('rejects an entry that includes a scheme', () => {
    const result = widgetSettingsSchema('en').safeParse({
      ...baseValues,
      allowedOrigins: ['https://example.com']
    });
    expect(result.success).toBe(false);
  });

  it('rejects an obviously invalid domain', () => {
    const result = widgetSettingsSchema('en').safeParse({
      ...baseValues,
      allowedOrigins: ['not a domain']
    });
    expect(result.success).toBe(false);
  });

  it('accepts localhost with a port, for local testing', () => {
    const result = widgetSettingsSchema('en').safeParse({
      ...baseValues,
      allowedOrigins: ['localhost:3000']
    });
    expect(result.success).toBe(true);
  });
});
