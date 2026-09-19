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

describe('AccountRecovery — multiple_businesses variant (V1 fail-closed case)', () => {
  it('renders a safe, generic message that never names a business, id, or count', () => {
    render(<AccountRecovery email='owner@example.com' variant='multiple_businesses' />);

    expect(screen.getByText('owner@example.com')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d+ business/i);
    expect(document.body.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    // Same recovery actions as the no_business variant — Try again / Sign out.
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign out/ })).toBeInTheDocument();
  });

  it('defaults to the no_business copy when no variant is given (unchanged existing behavior)', () => {
    render(<AccountRecovery email='owner@example.com' />);

    expect(screen.getByText(/couldn.t find a business linked to it yet/i)).toBeInTheDocument();
  });
});
