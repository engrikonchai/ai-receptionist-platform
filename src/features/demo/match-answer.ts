import type { DemoBusiness, MatchResult } from './types';

/**
 * A deliberately small, local, deterministic keyword matcher — the
 * demo's stand-in for the production reply engine. It never calls the
 * real (also keyword-based) reply engine, so this file can be replaced
 * with a real AI integration later without touching production code
 * or any demo UI component.
 */
const HANDOFF_KEYWORDS = [
  'person',
  'human',
  'someone',
  'talk to a person',
  'speak to',
  'agent',
  'representative'
];

export function matchVisitorMessage(business: DemoBusiness, rawText: string): MatchResult {
  const text = rawText.toLowerCase();

  if (HANDOFF_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return { kind: 'handoff' };
  }

  for (const entry of business.knowledgeBase) {
    if (entry.keywords.some((keyword) => text.includes(keyword.toLowerCase()))) {
      return { kind: 'answer', entry };
    }
  }

  return { kind: 'no-match' };
}
