// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIVE_BUSINESS_COOKIE, setActiveBusinessCookie } from '@/lib/active-business-cookie';
import { getQueryClient } from '@/lib/query-client';
import { AccountRecovery } from './account-recovery';

const push = vi.fn();
const refresh = vi.fn();
const signOut = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh })
}));

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({ auth: { signOut } })
}));

function readCookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`))
    ?.split('=')[1];
}

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  signOut.mockReset().mockResolvedValue({ error: null });
  document.cookie = `${ACTIVE_BUSINESS_COOKIE}=; path=/; max-age=0`;
  getQueryClient().clear();
});

describe('AccountRecovery — sign out', () => {
  it('clears cached queries and the active-business cookie before navigating to /login', async () => {
    setActiveBusinessCookie('biz-incomplete-account');
    getQueryClient().setQueryData(['knowledge', 'biz-incomplete-account', 'items'], []);

    const user = userEvent.setup();
    render(<AccountRecovery email='owner@example.com' />);

    await user.click(screen.getByRole('button', { name: /Sign out/ }));

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(getQueryClient().getQueryCache().getAll()).toHaveLength(0);
    expect(readCookie(ACTIVE_BUSINESS_COOKIE)).toBeUndefined();
    expect(push).toHaveBeenCalledWith('/login');
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
