import { describe, expect, it } from 'vitest';
import { matchVisitorMessage } from './match-answer';
import { DEMO_BUSINESSES, getDemoBusiness } from './scenarios';

const northside = getDemoBusiness('fitness-studio')!;

describe('matchVisitorMessage', () => {
  it('matches a suggested chip question to its knowledge base entry', () => {
    const result = matchVisitorMessage(northside, 'Do you have beginner classes?');
    expect(result).toEqual({ kind: 'answer', entry: northside.knowledgeBase[1] });
  });

  it('matches free-typed text containing a keyword, not just the exact chip phrasing', () => {
    const result = matchVisitorMessage(northside, 'what time do you open on saturday?');
    expect(result.kind).toBe('answer');
    if (result.kind === 'answer') {
      expect(result.entry.id).toBe('hours');
    }
  });

  it('matches case-insensitively', () => {
    const result = matchVisitorMessage(northside, 'WHAT ARE YOUR HOURS');
    expect(result).toEqual({ kind: 'answer', entry: northside.knowledgeBase[0] });
  });

  it('returns a handoff result for "talk to a person"', () => {
    expect(matchVisitorMessage(northside, 'Talk to a person')).toEqual({ kind: 'handoff' });
  });

  it('returns a handoff result for other human-request phrasing', () => {
    expect(matchVisitorMessage(northside, 'Can I speak to someone about this?')).toEqual({
      kind: 'handoff'
    });
  });

  it('returns no-match for a question outside the knowledge base', () => {
    expect(matchVisitorMessage(northside, northside.noMatchExample)).toEqual({
      kind: 'no-match'
    });
  });

  it('returns no-match for empty or unrelated text', () => {
    expect(matchVisitorMessage(northside, 'purple elephants dance quietly')).toEqual({
      kind: 'no-match'
    });
  });

  it("every business's declared no-match example genuinely produces no match", () => {
    for (const business of DEMO_BUSINESSES) {
      expect(matchVisitorMessage(business, business.noMatchExample)).toEqual({ kind: 'no-match' });
    }
  });

  it('every business has valid chipQuestionIds that resolve to real knowledge base entries', () => {
    for (const business of DEMO_BUSINESSES) {
      for (const id of business.chipQuestionIds) {
        const entry = business.knowledgeBase.find((kb) => kb.id === id);
        expect(entry).toBeDefined();
      }
    }
  });

  it("every business's chip sample questions match their own entry", () => {
    for (const business of DEMO_BUSINESSES) {
      for (const entry of business.knowledgeBase) {
        expect(matchVisitorMessage(business, entry.sampleQuestion)).toEqual({
          kind: 'answer',
          entry
        });
      }
    }
  });
});
