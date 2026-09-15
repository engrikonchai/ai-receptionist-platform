import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_ANSWER_MAX_LENGTH,
  KNOWLEDGE_CATEGORY_MAX_LENGTH,
  KNOWLEDGE_QUESTION_MAX_LENGTH,
  knowledgeItemSchema
} from './knowledge';

const baseValues = {
  category: 'Check-in',
  question: 'What time is check-in?',
  answerEn: 'Check-in is at 3pm.',
  answerMe: '',
  answerRu: '',
  isActive: true,
  sortOrder: 0
};

describe('knowledgeItemSchema — required fields', () => {
  it('accepts valid values with the default-language answer filled in', () => {
    const result = knowledgeItemSchema('en').safeParse(baseValues);
    expect(result.success).toBe(true);
  });

  it('rejects an empty category', () => {
    const result = knowledgeItemSchema('en').safeParse({ ...baseValues, category: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty question', () => {
    const result = knowledgeItemSchema('en').safeParse({ ...baseValues, question: '' });
    expect(result.success).toBe(false);
  });

  it('requires the default-language answer — English default, English blank', () => {
    const result = knowledgeItemSchema('en').safeParse({ ...baseValues, answerEn: '   ' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('answerEn'));
      expect(issue?.message).toBe('An answer in the default language is required.');
    }
  });

  it('requires the default-language answer — Montenegrin default, Montenegrin blank even though English is filled', () => {
    const result = knowledgeItemSchema('me').safeParse({
      ...baseValues,
      answerEn: 'filled',
      answerMe: ''
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('answerMe'));
      expect(issue?.message).toBe('An answer in the default language is required.');
    }
  });

  it('requires the default-language answer — Russian default, Russian filled passes even with English blank', () => {
    const result = knowledgeItemSchema('ru').safeParse({
      ...baseValues,
      answerEn: '',
      answerRu: 'Russian answer'
    });
    expect(result.success).toBe(true);
  });

  it('falls back to requiring English when defaultLanguage is not one of the three known codes', () => {
    const result = knowledgeItemSchema('fr').safeParse({ ...baseValues, answerEn: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('answerEn'))).toBe(true);
    }
  });
});

describe('knowledgeItemSchema — trimming', () => {
  it('trims category, question and answers', () => {
    const result = knowledgeItemSchema('en').safeParse({
      ...baseValues,
      category: '  Check-in  ',
      question: '  What time?  ',
      answerEn: '  3pm  '
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBe('Check-in');
      expect(result.data.question).toBe('What time?');
      expect(result.data.answerEn).toBe('3pm');
    }
  });

  it('a question that is only whitespace is rejected, not silently trimmed to empty and accepted', () => {
    const result = knowledgeItemSchema('en').safeParse({ ...baseValues, question: '     ' });
    expect(result.success).toBe(false);
  });
});

describe('knowledgeItemSchema — maximum lengths', () => {
  it('rejects a category over the maximum length', () => {
    const result = knowledgeItemSchema('en').safeParse({
      ...baseValues,
      category: 'a'.repeat(KNOWLEDGE_CATEGORY_MAX_LENGTH + 1)
    });
    expect(result.success).toBe(false);
  });

  it('accepts a category at exactly the maximum length', () => {
    const result = knowledgeItemSchema('en').safeParse({
      ...baseValues,
      category: 'a'.repeat(KNOWLEDGE_CATEGORY_MAX_LENGTH)
    });
    expect(result.success).toBe(true);
  });

  it('rejects a question over the maximum length', () => {
    const result = knowledgeItemSchema('en').safeParse({
      ...baseValues,
      question: 'a'.repeat(KNOWLEDGE_QUESTION_MAX_LENGTH + 1)
    });
    expect(result.success).toBe(false);
  });

  it('rejects an answer over the maximum length', () => {
    const result = knowledgeItemSchema('en').safeParse({
      ...baseValues,
      answerEn: 'a'.repeat(KNOWLEDGE_ANSWER_MAX_LENGTH + 1)
    });
    expect(result.success).toBe(false);
  });
});

describe('knowledgeItemSchema — sort_order', () => {
  it('accepts zero and positive integers', () => {
    expect(knowledgeItemSchema('en').safeParse({ ...baseValues, sortOrder: 0 }).success).toBe(true);
    expect(knowledgeItemSchema('en').safeParse({ ...baseValues, sortOrder: 42 }).success).toBe(
      true
    );
  });

  it('rejects a negative sort order', () => {
    const result = knowledgeItemSchema('en').safeParse({ ...baseValues, sortOrder: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer sort order', () => {
    const result = knowledgeItemSchema('en').safeParse({ ...baseValues, sortOrder: 1.5 });
    expect(result.success).toBe(false);
  });

  it('rejects an unreasonably large sort order', () => {
    const result = knowledgeItemSchema('en').safeParse({ ...baseValues, sortOrder: 1e9 });
    expect(result.success).toBe(false);
  });
});
