import { describe, expect, it } from 'vitest';
import { handoffStatusIndicatorLabel } from './format';

describe('handoffStatusIndicatorLabel', () => {
  it('labels a "new" handoff as requested, regardless of human_takeover', () => {
    expect(handoffStatusIndicatorLabel('new', false)).toBe('Handoff requested');
    expect(handoffStatusIndicatorLabel('new', true)).toBe('Handoff requested');
  });

  it('labels a "resolved" handoff as resolved, regardless of human_takeover', () => {
    expect(handoffStatusIndicatorLabel('resolved', false)).toBe('Resolved');
    expect(handoffStatusIndicatorLabel('resolved', true)).toBe('Resolved');
  });

  it('labels a "contacted" handoff as being handled by a human when human_takeover is true', () => {
    expect(handoffStatusIndicatorLabel('contacted', true)).toBe('Being handled by human');
  });

  it('labels a "contacted" handoff as returned to automation when human_takeover is false — the "owner returns control" transition', () => {
    expect(handoffStatusIndicatorLabel('contacted', false)).toBe('Returned to automation');
  });
});
