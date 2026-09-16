// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIVE_BUSINESS_COOKIE, setActiveBusinessCookie } from '@/lib/active-business-cookie';
import { getQueryClient } from '@/lib/query-client';
import type { ProfileRow } from '@/lib/supabase/database.types';
import { SidebarProvider } from '@/components/ui/sidebar';
import { OwnerMenu } from './owner-menu';

// SidebarProvider's mobile detection reads window.matchMedia, which
// jsdom doesn't implement.
window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false
  }) as unknown as MediaQueryList;

function renderOwnerMenu(props: { email: string; profile: ProfileRow | null }) {
  return render(
    <SidebarProvider>
      <OwnerMenu {...props} />
    </SidebarProvider>
  );
}

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

describe('OwnerMenu — sign out', () => {
  it('clears every cached query and the active-business cookie before navigating to /login — the account-switch guard', async () => {
    // Simulate this owner having actually used the dashboard: cached
    // inbox data under their business id, plus a stale cookie pointing
    // at it.
    setActiveBusinessCookie('biz-old-owner');
    getQueryClient().setQueryData(['inbox', 'biz-old-owner', 'conversations'], [{ id: 'conv-1' }]);
    expect(getQueryClient().getQueryData(['inbox', 'biz-old-owner', 'conversations'])).toEqual([
      { id: 'conv-1' }
    ]);

    const user = userEvent.setup();
    renderOwnerMenu({ email: 'owner@example.com', profile: null });

    await user.click(screen.getByRole('button', { name: /owner@example\.com/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(
      getQueryClient().getQueryData(['inbox', 'biz-old-owner', 'conversations'])
    ).toBeUndefined();
    expect(getQueryClient().getQueryCache().getAll()).toHaveLength(0);
    expect(readCookie(ACTIVE_BUSINESS_COOKIE)).toBeUndefined();
    expect(push).toHaveBeenCalledWith('/login');
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe('OwnerMenu — profile display', () => {
  it('falls back to the email when there is no display name', () => {
    const profile = { display_name: null } as unknown as ProfileRow;
    renderOwnerMenu({ email: 'owner@example.com', profile });
    expect(screen.getAllByText('owner@example.com').length).toBeGreaterThan(0);
  });

  it('shows the trimmed display name when one is set', () => {
    const profile = { display_name: '  Jordan  ' } as unknown as ProfileRow;
    renderOwnerMenu({ email: 'owner@example.com', profile });
    expect(screen.getAllByText('Jordan').length).toBeGreaterThan(0);
  });
});
