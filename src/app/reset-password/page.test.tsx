// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { RESET_LINK_INVALID_MESSAGE } from '@/features/auth/messages';
import ResetPasswordPage from './page';

vi.mock('@/lib/supabase/env', () => ({
  isSupabaseConfigured: () => true,
  SUPABASE_MISSING_ENV_MESSAGE: 'Supabase is not configured.'
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn()
}));

// The authenticated branch renders ResetPasswordForm, a Client
// Component that calls useRouter() and the browser Supabase client —
// neither is exercised by these page-level tests, so both are stubbed.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() })
}));

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({ auth: { updateUser: vi.fn(), signOut: vi.fn() } })
}));

function mockUser(user: User | null) {
  vi.mocked(createSupabaseServerClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) }
  } as unknown as SupabaseClient);
}

describe('ResetPasswordPage', () => {
  it('shows the invalid/expired-link state for an unauthenticated visit — no recovery session, no form', async () => {
    mockUser(null);

    render(await ResetPasswordPage());

    expect(screen.getByText(RESET_LINK_INVALID_MESSAGE)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Request a new password reset link' })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  });

  it('renders the reset form for a request carrying a valid recovery session', async () => {
    mockUser({ id: 'user-1' } as unknown as User);

    render(await ResetPasswordPage());

    expect(screen.getByLabelText(/^New password/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Confirm new password/)).toBeInTheDocument();
    expect(screen.queryByText(RESET_LINK_INVALID_MESSAGE)).not.toBeInTheDocument();
  });
});
