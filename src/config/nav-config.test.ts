import { describe, expect, it } from 'vitest';
import { Icons } from '@/components/icons';
import { navGroups } from './nav-config';

describe('nav-config — Agent item', () => {
  it('links to /dashboard/agent, placed in Main near Knowledge and Widget, with a real registered icon', () => {
    const mainGroup = navGroups.find((group) => group.label === 'Main');
    expect(mainGroup).toBeDefined();

    const items = mainGroup?.items ?? [];
    const agentIndex = items.findIndex((item) => item.title === 'Agent');
    const knowledgeIndex = items.findIndex((item) => item.title === 'Knowledge');
    const widgetIndex = items.findIndex((item) => item.title === 'Widget');

    expect(agentIndex).toBeGreaterThan(-1);
    expect(items[agentIndex]?.url).toBe('/dashboard/agent');
    // "near Knowledge and Widget" — between them or immediately adjacent,
    // not off at an arbitrary position in the group.
    expect(agentIndex).toBeGreaterThanOrEqual(Math.min(knowledgeIndex, widgetIndex) - 1);
    expect(agentIndex).toBeLessThanOrEqual(Math.max(knowledgeIndex, widgetIndex) + 1);

    const iconKey = items[agentIndex]?.icon;
    expect(iconKey).toBeDefined();
    expect(iconKey && iconKey in Icons).toBe(true);
  });
});
