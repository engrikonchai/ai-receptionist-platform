import { describe, expect, it } from 'vitest';
import { pluralize } from './pluralize';

describe('pluralize', () => {
  it('returns the singular form for exactly 1', () => {
    expect(pluralize(1, 'lead')).toBe('lead');
  });

  it('returns the default regular plural (+s) for 0 and for more than 1', () => {
    expect(pluralize(0, 'lead')).toBe('leads');
    expect(pluralize(5, 'lead')).toBe('leads');
  });

  it('uses an explicit irregular plural when given one', () => {
    expect(pluralize(2, 'handoff', 'handoffs')).toBe('handoffs');
    expect(pluralize(1, 'handoff', 'handoffs')).toBe('handoff');
  });
});
