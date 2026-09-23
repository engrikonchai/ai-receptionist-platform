// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PASSWORD_RESET_SUCCESS_MESSAGE } from '../messages';
import { LoginForm } from './login-form';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() })
}));

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({ auth: { signInWithPassword: vi.fn() } })
}));

vi.mock('@/lib/supabase/env', () => ({
  isSupabaseConfigured: () => true,
  SUPABASE_MISSING_ENV_MESSAGE: 'Supabase is not configured.'
}));

describe('LoginForm — password reset success message', () => {
  it('renders the exact success copy when passed, as a status message rather than an alert', () => {
    render(
      <LoginForm next='/dashboard/overview' successMessage={PASSWORD_RESET_SUCCESS_MESSAGE} />
    );

    const message = screen.getByText(PASSWORD_RESET_SUCCESS_MESSAGE);
    expect(message).toBeInTheDocument();
    // Rendered inside a role="status" region (informational), never
    // role="alert" or the destructive error styling used for real
    // login errors. LoadingButton also renders its own (empty, hidden)
    // status span, so check *some* status region contains the message
    // rather than assuming there's only one on the page.
    const statusRegions = screen.getAllByRole('status');
    expect(statusRegions.some((region) => region.contains(message))).toBe(true);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders nothing extra when no success message is passed', () => {
    render(<LoginForm next='/dashboard/overview' />);

    expect(screen.queryByText(PASSWORD_RESET_SUCCESS_MESSAGE)).not.toBeInTheDocument();
  });

  it('still shows a real login error as an alert, distinct from the success message', () => {
    render(
      <LoginForm
        next='/dashboard/overview'
        initialError='Incorrect email or password.'
        successMessage={PASSWORD_RESET_SUCCESS_MESSAGE}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Incorrect email or password.');
    expect(screen.getByText(PASSWORD_RESET_SUCCESS_MESSAGE)).toBeInTheDocument();
  });

  it('links to /forgot-password', () => {
    render(<LoginForm next='/dashboard/overview' />);

    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute(
      'href',
      '/forgot-password'
    );
  });
});

describe('LoginForm — show/hide password', () => {
  it('toggles the password field between hidden and visible, keyboard-operable', async () => {
    const user = userEvent.setup();
    render(<LoginForm next='/dashboard/overview' />);

    const input = screen.getByLabelText(/^Password/);
    expect(input).toHaveAttribute('type', 'password');

    const group = within(input.parentElement as HTMLElement);
    await user.click(group.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');

    await user.click(group.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });
});
