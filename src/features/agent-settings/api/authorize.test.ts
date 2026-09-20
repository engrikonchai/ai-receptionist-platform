import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { loadOwnerContext } from '@/lib/supabase/owner-context';
import type { BusinessRow } from '@/lib/supabase/database.types';
import { NO_BUSINESS_ACCESS_MESSAGE, SESSION_EXPIRED_MESSAGE } from './types';
import { verifyActiveBusiness } from './authorize';

vi.mock('@/lib/supabase/owner-context', () => ({
  loadOwnerContext: vi.fn()
}));

const stubSupabase = {} as unknown as SupabaseClient;
const stubUser = { id: 'user-1' } as unknown as User;

function business(id: string): BusinessRow {
  return { id } as BusinessRow;
}

describe('verifyActiveBusiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects with no re-check when no business id is supplied', async () => {
    const result = await verifyActiveBusiness(null);
    expect(result).toEqual({ ok: false, error: 'No business selected.' });
    expect(loadOwnerContext).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated session', async () => {
    vi.mocked(loadOwnerContext).mockResolvedValue({ status: 'unauthenticated' });

    const result = await verifyActiveBusiness('biz-1');

    expect(result).toEqual({ ok: false, error: SESSION_EXPIRED_MESSAGE });
  });

  it('rejects when the owner has no profile/business yet', async () => {
    vi.mocked(loadOwnerContext).mockResolvedValue({
      status: 'incomplete_profile',
      user: stubUser,
      supabase: stubSupabase
    });

    const result = await verifyActiveBusiness('biz-1');

    expect(result).toEqual({ ok: false, error: NO_BUSINESS_ACCESS_MESSAGE });
  });

  it('fails closed on the V1 multiple_businesses guard — never picks an arbitrary business from an ambiguous owner state', async () => {
    vi.mocked(loadOwnerContext).mockResolvedValue({
      status: 'multiple_businesses',
      user: stubUser,
      businessCount: 2,
      supabase: stubSupabase
    });

    const result = await verifyActiveBusiness('biz-1');

    expect(result).toEqual({ ok: false, error: NO_BUSINESS_ACCESS_MESSAGE });
  });

  it('rejects a business id that is not in the RLS-scoped businesses this owner can see — the cross-business/ownership guard', async () => {
    vi.mocked(loadOwnerContext).mockResolvedValue({
      status: 'ok',
      user: stubUser,
      profile: {} as never,
      businesses: [business('biz-owned')],
      supabase: stubSupabase
    });

    const result = await verifyActiveBusiness('biz-someone-elses');

    expect(result).toEqual({ ok: false, error: NO_BUSINESS_ACCESS_MESSAGE });
  });

  it('accepts a business id that is in the owner’s own business list', async () => {
    vi.mocked(loadOwnerContext).mockResolvedValue({
      status: 'ok',
      user: stubUser,
      profile: {} as never,
      businesses: [business('biz-other'), business('biz-owned')],
      supabase: stubSupabase
    });

    const result = await verifyActiveBusiness('biz-owned');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ctx.businessId).toBe('biz-owned');
      expect(result.ctx.user).toBe(stubUser);
      expect(result.ctx.supabase).toBe(stubSupabase);
    }
  });
});
