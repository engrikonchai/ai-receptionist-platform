import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fallbackReply, generateKnowledgeReply } from './knowledge-reply';

function chainable<T>(result: T) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (value: T) => void) => Promise.resolve(result).then(resolve);
        }
        return () => proxy;
      }
    }
  );
  return proxy;
}

function mockClient(data: unknown, error: unknown = null): SupabaseClient {
  const from = vi.fn().mockReturnValue(chainable({ data, error }));
  return { from } as unknown as SupabaseClient;
}

const ITEMS = [
  {
    id: 'item-1',
    business_id: 'business-a',
    category: 'Check-in',
    question: 'What time is check-in?',
    answer_en: 'Check-in is at 14:00.',
    answer_me: 'Prijava je u 14:00.',
    answer_ru: null,
    is_active: true,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z'
  },
  {
    id: 'item-2',
    business_id: 'business-a',
    category: 'Parking',
    question: 'Is parking available?',
    answer_en: 'Yes, free parking is available on-site.',
    answer_me: null,
    answer_ru: null,
    is_active: true,
    sort_order: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z'
  }
];

describe('generateKnowledgeReply', () => {
  it('returns the answer for the item with the most keyword overlap', async () => {
    const supabase = mockClient(ITEMS);
    const reply = await generateKnowledgeReply(
      supabase,
      'business-a',
      'What time is check-in?',
      'en'
    );
    expect(reply).toBe('Check-in is at 14:00.');
  });

  it('matches a different item for a different question', async () => {
    const supabase = mockClient(ITEMS);
    const reply = await generateKnowledgeReply(
      supabase,
      'business-a',
      'Is parking available here?',
      'en'
    );
    expect(reply).toBe('Yes, free parking is available on-site.');
  });

  it('falls back to the localized fallback reply when nothing matches', async () => {
    const supabase = mockClient(ITEMS);
    const reply = await generateKnowledgeReply(supabase, 'business-a', 'asdf qwerty zzz', 'en');
    expect(reply).toBe(fallbackReply('en'));
  });

  it('falls back when the business has no active knowledge items', async () => {
    const supabase = mockClient([]);
    const reply = await generateKnowledgeReply(
      supabase,
      'business-a',
      'What time is check-in?',
      'en'
    );
    expect(reply).toBe(fallbackReply('en'));
  });

  it('falls back on a database error instead of throwing', async () => {
    const supabase = mockClient(null, { message: 'db down' });
    const reply = await generateKnowledgeReply(
      supabase,
      'business-a',
      'What time is check-in?',
      'en'
    );
    expect(reply).toBe(fallbackReply('en'));
  });

  it('answers in the requested language when a translation exists, falling back to English otherwise', async () => {
    const supabase = mockClient(ITEMS);
    const meReply = await generateKnowledgeReply(
      supabase,
      'business-a',
      'What time is check-in?',
      'me'
    );
    expect(meReply).toBe('Prijava je u 14:00.');

    const ruReply = await generateKnowledgeReply(
      supabase,
      'business-a',
      'What time is check-in?',
      'ru'
    );
    expect(ruReply).toBe('Check-in is at 14:00.');
  });

  it('scopes the query to the given business id and only active items, never another business’s items', async () => {
    const eq = vi.fn();
    const proxy: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') {
            return (resolve: (value: unknown) => void) =>
              Promise.resolve({ data: ITEMS, error: null }).then(resolve);
          }
          if (prop === 'eq') {
            return (...args: unknown[]) => {
              eq(...args);
              return proxy;
            };
          }
          return () => proxy;
        }
      }
    );

    const from = vi.fn().mockReturnValue(proxy);
    const supabase = { from } as unknown as SupabaseClient;

    await generateKnowledgeReply(supabase, 'business-a', 'check-in time', 'en');

    expect(from).toHaveBeenCalledWith('knowledge_items');
    expect(eq).toHaveBeenCalledWith('business_id', 'business-a');
    expect(eq).toHaveBeenCalledWith('is_active', true);
  });
});
