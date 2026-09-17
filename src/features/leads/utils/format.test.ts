import { describe, expect, it } from 'vitest';
import { handoffStatusIndicatorLabel } from './format';

describe('handoffStatusIndicatorLabel', () => {
  it('mirrors src/features/inbox/utils/format.ts’s own derivation exactly', () => {
    expect(handoffStatusIndicatorLabel('new', false)).toBe('Handoff requested');
    expect(handoffStatusIndicatorLabel('resolved', true)).toBe('Resolved');
    expect(handoffStatusIndicatorLabel('contacted', true)).toBe('Being handled by human');
    expect(handoffStatusIndicatorLabel('contacted', false)).toBe('Returned to automation');
  });
});
