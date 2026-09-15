import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { verifyActiveBusiness } from './authorize';
import {
  GENERIC_LOAD_ERROR,
  GENERIC_SAVE_ERROR,
  ITEM_UNAVAILABLE_ERROR,
  SESSION_EXPIRED_MESSAGE
} from './types';
import {
  createKnowledgeItem,
  deleteKnowledgeItem,
  fetchKnowledgeItems,
  toggleKnowledgeItem,
  updateKnowledgeItem
} from './service';

vi.mock('./authorize', () => ({
  verifyActiveBusiness: vi.fn()
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn()
}));

/**
 * A stand-in for Supabase's PostgREST query builder — see the identical
 * helper (and its rationale) in src/features/inbox/api/service.test.ts.
 */
function chainable<T>(result: T) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (value: T) => void, reject?: (reason: unknown) => void) =>
            Promise.resolve(result).then(resolve, reject);
        }
        if (prop === 'catch') {
          return (reject: (reason: unknown) => void) => Promise.resolve(result).catch(reject);
        }
        return () => proxy;
      }
    }
  );
  return proxy;
}

const stubUser = { id: 'user-1' } as unknown as User;
const VERIFIED_BUSINESS_ID = 'biz-verified';

function mockVerifiedBusiness(from: ReturnType<typeof vi.fn>, businessId = VERIFIED_BUSINESS_ID) {
  vi.mocked(verifyActiveBusiness).mockResolvedValue({
    ok: true,
    ctx: { supabase: { from } as unknown as SupabaseClient, user: stubUser, businessId }
  });
}

const validInput = {
  businessId: VERIFIED_BUSINESS_ID,
  defaultLanguage: 'en',
  category: 'Check-in',
  question: 'What time is check-in?',
  answerEn: 'Check-in is at 3pm.',
  answerMe: '',
  answerRu: '',
  isActive: true,
  sortOrder: 0
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchKnowledgeItems', () => {
  it('propagates the authorization failure instead of querying anything', async () => {
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: false,
      error: SESSION_EXPIRED_MESSAGE
    });

    await expect(fetchKnowledgeItems('biz-1')).rejects.toThrow(SESSION_EXPIRED_MESSAGE);
  });

  it('maps rows, converting null answer_me/answer_ru to empty strings', async () => {
    const from = vi.fn().mockReturnValueOnce(
      chainable({
        data: [
          {
            id: 'item-1',
            category: 'Check-in',
            question: 'What time?',
            answer_en: '3pm',
            answer_me: null,
            answer_ru: null,
            is_active: true,
            sort_order: 0,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z'
          }
        ],
        error: null
      })
    );
    mockVerifiedBusiness(from);

    const [item] = await fetchKnowledgeItems('biz-1');

    expect(item.answerEn).toBe('3pm');
    expect(item.answerMe).toBe('');
    expect(item.answerRu).toBe('');
  });

  it('throws a friendly error, never the raw database message, when the query fails', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(
        chainable({ data: null, error: { message: 'relation does not exist' } })
      );
    mockVerifiedBusiness(from);

    await expect(fetchKnowledgeItems('biz-1')).rejects.toThrow(GENERIC_LOAD_ERROR);
    await expect(fetchKnowledgeItems('biz-1')).rejects.not.toThrow(/relation does not exist/);
  });
});

describe('createKnowledgeItem', () => {
  it('rejects an unauthenticated create', async () => {
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: false,
      error: SESSION_EXPIRED_MESSAGE
    });

    const result = await createKnowledgeItem(validInput);

    expect(result).toEqual({ success: false, error: SESSION_EXPIRED_MESSAGE });
  });

  it('always verifies the exact business id it was given, and writes using the verified business id — never a browser-supplied one taken at face value', async () => {
    let insertPayload: Record<string, unknown> | undefined;
    const from = vi.fn(() => ({
      insert: (payload: Record<string, unknown>) => {
        insertPayload = payload;
        return chainable({
          data: {
            id: 'item-new',
            category: 'Check-in',
            question: 'What time?',
            answer_en: '3pm',
            answer_me: null,
            answer_ru: null,
            is_active: true,
            sort_order: 0,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z'
          },
          error: null
        });
      }
    }));
    // The caller sends businessId "spoofed-id"; the verified context
    // resolves to a *different* id ("biz-verified") — this is what a
    // real cross-owner spoof attempt would look like, since
    // verifyActiveBusiness only ever returns the id it actually
    // confirmed ownership of.
    mockVerifiedBusiness(from, 'biz-verified-different-from-input');

    await createKnowledgeItem({ ...validInput, businessId: 'spoofed-id' });

    expect(verifyActiveBusiness).toHaveBeenCalledWith('spoofed-id');
    expect(insertPayload?.business_id).toBe('biz-verified-different-from-input');
  });

  it('rejects a missing default-language answer before ever touching the database', async () => {
    const from = vi.fn();
    mockVerifiedBusiness(from);

    const result = await createKnowledgeItem({ ...validInput, answerEn: '   ' });

    expect(result).toEqual({
      success: false,
      error: 'An answer in the default language is required.'
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('trims category, question and answers before inserting', async () => {
    let insertPayload: Record<string, unknown> | undefined;
    const from = vi.fn(() => ({
      insert: (payload: Record<string, unknown>) => {
        insertPayload = payload;
        return chainable({
          data: {
            id: 'item-new',
            category: 'Check-in',
            question: 'What time?',
            answer_en: '3pm',
            answer_me: null,
            answer_ru: null,
            is_active: true,
            sort_order: 0,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z'
          },
          error: null
        });
      }
    }));
    mockVerifiedBusiness(from);

    await createKnowledgeItem({
      ...validInput,
      category: '  Check-in  ',
      question: '  What time?  ',
      answerEn: '  3pm  '
    });

    expect(insertPayload).toMatchObject({
      category: 'Check-in',
      question: 'What time?',
      answer_en: '3pm'
    });
  });

  it('stores empty non-default-language answers as null, not empty strings', async () => {
    let insertPayload: Record<string, unknown> | undefined;
    const from = vi.fn(() => ({
      insert: (payload: Record<string, unknown>) => {
        insertPayload = payload;
        return chainable({
          data: {
            id: 'item-new',
            category: 'Check-in',
            question: 'What time?',
            answer_en: '3pm',
            answer_me: null,
            answer_ru: null,
            is_active: true,
            sort_order: 0,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z'
          },
          error: null
        });
      }
    }));
    mockVerifiedBusiness(from);

    await createKnowledgeItem({ ...validInput, answerMe: '', answerRu: '' });

    expect(insertPayload?.answer_me).toBeNull();
    expect(insertPayload?.answer_ru).toBeNull();
  });

  it('succeeds and returns the created item', async () => {
    const from = vi.fn(() => ({
      insert: () =>
        chainable({
          data: {
            id: 'item-new',
            category: 'Check-in',
            question: 'What time is check-in?',
            answer_en: 'Check-in is at 3pm.',
            answer_me: null,
            answer_ru: null,
            is_active: true,
            sort_order: 0,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z'
          },
          error: null
        })
    }));
    mockVerifiedBusiness(from);

    const result = await createKnowledgeItem(validInput);

    expect(result.success).toBe(true);
    if (result.success) expect(result.item.id).toBe('item-new');
  });

  it('returns a friendly error, never the raw database message, when the insert fails', async () => {
    const from = vi.fn(() => ({
      insert: () => chainable({ data: null, error: { message: 'permission denied for table' } })
    }));
    mockVerifiedBusiness(from);

    const result = await createKnowledgeItem(validInput);

    expect(result).toEqual({ success: false, error: GENERIC_SAVE_ERROR });
  });
});

describe('updateKnowledgeItem', () => {
  it('rejects an unauthenticated update', async () => {
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: false,
      error: SESSION_EXPIRED_MESSAGE
    });

    const result = await updateKnowledgeItem({ ...validInput, itemId: 'item-1' });

    expect(result).toEqual({ success: false, error: SESSION_EXPIRED_MESSAGE });
  });

  it('reports the item as unavailable instead of leaking data when it belongs to another business', async () => {
    // `.eq('business_id', verifiedId).eq('id', itemId)` matches nothing
    // — exactly what happens for a cross-business id.
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null, error: null }));
    mockVerifiedBusiness(from);

    const result = await updateKnowledgeItem({
      ...validInput,
      itemId: 'item-from-another-business'
    });

    expect(result).toEqual({ success: false, error: ITEM_UNAVAILABLE_ERROR });
  });

  it('writes an unchanged hidden-language answer back exactly as given — editing never erases it just because its field was hidden in the form', async () => {
    let updatePayload: Record<string, unknown> | undefined;
    const from = vi.fn(() => ({
      update: (payload: Record<string, unknown>) => {
        updatePayload = payload;
        return chainable({
          data: {
            id: 'item-1',
            category: 'Check-in',
            question: 'What time?',
            answer_en: '3pm',
            answer_me: 'Postojeci crnogorski odgovor',
            answer_ru: null,
            is_active: true,
            sort_order: 0,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z'
          },
          error: null
        });
      }
    }));
    mockVerifiedBusiness(from);

    // Montenegrin ("me") isn't in this form's supported languages, so
    // its field was never rendered/edited — but the caller (the sheet's
    // defaultValues) still carries the existing value forward unchanged.
    await updateKnowledgeItem({
      ...validInput,
      itemId: 'item-1',
      answerMe: 'Postojeci crnogorski odgovor'
    });

    expect(updatePayload?.answer_me).toBe('Postojeci crnogorski odgovor');
  });

  it('succeeds and returns the updated item', async () => {
    const from = vi.fn(() => ({
      update: () =>
        chainable({
          data: {
            id: 'item-1',
            category: 'Pricing',
            question: 'How much?',
            answer_en: 'Depends on dates.',
            answer_me: null,
            answer_ru: null,
            is_active: false,
            sort_order: 5,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-02T00:00:00Z'
          },
          error: null
        })
    }));
    mockVerifiedBusiness(from);

    const result = await updateKnowledgeItem({
      ...validInput,
      itemId: 'item-1',
      category: 'Pricing',
      question: 'How much?',
      answerEn: 'Depends on dates.',
      isActive: false,
      sortOrder: 5
    });

    expect(result).toEqual({
      success: true,
      item: {
        id: 'item-1',
        category: 'Pricing',
        question: 'How much?',
        answerEn: 'Depends on dates.',
        answerMe: '',
        answerRu: '',
        isActive: false,
        sortOrder: 5,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z'
      }
    });
  });

  it('returns a friendly error, never the raw database message, when the update fails', async () => {
    const from = vi.fn(() => ({
      update: () =>
        chainable({ data: null, error: { message: 'constraint violation on knowledge_items' } })
    }));
    mockVerifiedBusiness(from);

    const result = await updateKnowledgeItem({ ...validInput, itemId: 'item-1' });

    expect(result).toEqual({ success: false, error: GENERIC_SAVE_ERROR });
  });
});

describe('toggleKnowledgeItem', () => {
  it('rejects a cross-business item', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null, error: null }));
    mockVerifiedBusiness(from);

    const result = await toggleKnowledgeItem('biz-1', 'item-from-another-business', false);

    expect(result).toEqual({ success: false, error: ITEM_UNAVAILABLE_ERROR });
  });

  it('activates and deactivates successfully', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: { id: 'item-1' }, error: null }));
    mockVerifiedBusiness(from);

    await expect(toggleKnowledgeItem('biz-1', 'item-1', false)).resolves.toEqual({ success: true });
  });

  it('returns a friendly error when the update fails', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: null, error: { message: 'db down' } }));
    mockVerifiedBusiness(from);

    const result = await toggleKnowledgeItem('biz-1', 'item-1', true);

    expect(result).toEqual({ success: false, error: GENERIC_SAVE_ERROR });
  });
});

describe('deleteKnowledgeItem', () => {
  it('rejects an unauthenticated delete', async () => {
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: false,
      error: SESSION_EXPIRED_MESSAGE
    });

    const result = await deleteKnowledgeItem('biz-1', 'item-1');

    expect(result).toEqual({ success: false, error: SESSION_EXPIRED_MESSAGE });
  });

  it('rejects a cross-business item instead of deleting it', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null, error: null }));
    mockVerifiedBusiness(from);

    const result = await deleteKnowledgeItem('biz-1', 'item-from-another-business');

    expect(result).toEqual({ success: false, error: ITEM_UNAVAILABLE_ERROR });
  });

  it('deletes successfully', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: { id: 'item-1' }, error: null }));
    mockVerifiedBusiness(from);

    await expect(deleteKnowledgeItem('biz-1', 'item-1')).resolves.toEqual({ success: true });
  });

  it('returns a friendly error, never the raw database message, when the delete fails', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: null, error: { message: 'foreign key violation' } }));
    mockVerifiedBusiness(from);

    const result = await deleteKnowledgeItem('biz-1', 'item-1');

    expect(result).toEqual({ success: false, error: GENERIC_SAVE_ERROR });
  });
});
