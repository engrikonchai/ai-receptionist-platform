// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PASSWORD_RESET_EMAIL_SENT_MESSAGE } from '../messages';
import { ForgotPasswordForm } from './forgot-password-form';

const resetPasswordForEmail = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: { resetPasswordForEmail }
  })
}));

vi.mock('@/lib/supabase/env', () => ({
  isSupabaseConfigured: () => true,
  SUPABASE_MISSING_ENV_MESSAGE: 'Supabase is not configured.'
}));

vi.mock('@/lib/site-url', () => ({
  getSiteUrl: () => 'https://app.example.com'
}));

beforeEach(() => {
  resetPasswordForEmail.mockReset();
  resetPasswordForEmail.mockResolvedValue({ error: null });
});

describe('ForgotPasswordForm', () => {
  it('calls resetPasswordForEmail with a redirectTo built from the site URL helper, pointing at /reset-password via the callback', async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText(/^Email/), 'owner@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    await waitFor(() => expect(resetPasswordForEmail).toHaveBeenCalledTimes(1));
    expect(resetPasswordForEmail).toHaveBeenCalledWith('owner@example.com', {
      redirectTo: 'https://app.example.com/auth/callback?next=%2Freset-password'
    });
  });

  it('shows the exact same success message whether or not the account exists (Supabase reports no error either way)', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText(/^Email/), 'exists@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByText(PASSWORD_RESET_EMAIL_SENT_MESSAGE)).toBeInTheDocument();
  });

  it('shows the same success message even when the request itself fails, never a distinct error', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: { message: 'over_email_send_rate_limit' } });
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText(/^Email/), 'someone@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByText(PASSWORD_RESET_EMAIL_SENT_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(/rate limit/i)).not.toBeInTheDocument();
  });

  it('shows the same success message even when the call throws outright', async () => {
    resetPasswordForEmail.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText(/^Email/), 'someone@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByText(PASSWORD_RESET_EMAIL_SENT_MESSAGE)).toBeInTheDocument();
  });

  it('rejects an invalid email client-side without ever calling Supabase', async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText(/^Email/), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('disables the submit button while submitting', async () => {
    const { promise, resolve } = (() => {
      let res!: (value: { error: null }) => void;
      const p = new Promise<{ error: null }>((r) => {
        res = r;
      });
      return { promise: p, resolve: res };
    })();
    resetPasswordForEmail.mockReturnValue(promise);
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText(/^Email/), 'owner@example.com');
    const submit = screen.getByRole('button', { name: 'Send reset link' });
    await user.click(submit);

    await waitFor(() => expect(submit).toBeDisabled());
    resolve({ error: null });
  });
});
