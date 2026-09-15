// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RESET_LINK_INVALID_MESSAGE } from '../messages';
import { ResetPasswordForm } from './reset-password-form';

const updateUser = vi.fn();
const signOut = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh })
}));

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: { updateUser, signOut }
  })
}));

vi.mock('@/lib/supabase/env', () => ({
  isSupabaseConfigured: () => true,
  SUPABASE_MISSING_ENV_MESSAGE: 'Supabase is not configured.'
}));

beforeEach(() => {
  updateUser.mockReset();
  signOut.mockReset().mockResolvedValue({ error: null });
  push.mockReset();
  refresh.mockReset();
});

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  password: string,
  confirm = password
) {
  await user.type(screen.getByLabelText(/^New password/), password);
  await user.type(screen.getByLabelText(/^Confirm new password/), confirm);
  await user.click(screen.getByRole('button', { name: 'Update password' }));
}

describe('ResetPasswordForm — client-side validation', () => {
  it('rejects a password shorter than 8 characters without calling updateUser', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm />);

    await fillAndSubmit(user, 'short1');

    expect(await screen.findByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('rejects mismatched passwords without calling updateUser', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm />);

    await fillAndSubmit(user, 'longenough1', 'longenough2');

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });
});

describe('ResetPasswordForm — show/hide password', () => {
  it('toggles the new-password field between hidden and visible', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm />);

    const input = screen.getByLabelText(/^New password/);
    expect(input).toHaveAttribute('type', 'password');

    // Both password fields render their own toggle — scope the query to
    // the New password field's own input group.
    const group = within(input.closest('[data-slot="input-group"]') as HTMLElement);

    await user.click(group.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');

    await user.click(group.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });
});

describe('ResetPasswordForm — successful update', () => {
  it('calls updateUser with the new password, then signs out and redirects to /login?passwordReset=success', async () => {
    updateUser.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<ResetPasswordForm />);

    await fillAndSubmit(user, 'brandnewpassword1');

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'brandnewpassword1' }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/login?passwordReset=success'));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('shows a success message before redirecting', async () => {
    updateUser.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<ResetPasswordForm />);

    await fillAndSubmit(user, 'brandnewpassword1');

    expect(await screen.findByText(/Password updated/)).toBeInTheDocument();
  });
});

describe('ResetPasswordForm — update failures', () => {
  it('shows a generic friendly error for an unrecognized failure, never a raw database/auth detail', async () => {
    updateUser.mockResolvedValue({
      error: { message: 'internal constraint violation on table auth.users' }
    });
    const user = userEvent.setup();
    render(<ResetPasswordForm />);

    await fillAndSubmit(user, 'brandnewpassword1');

    expect(
      await screen.findByText('We could not update your password. Please try again.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/constraint violation/)).not.toBeInTheDocument();
    expect(screen.queryByText(/auth\.users/)).not.toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("passes through Supabase's own user-facing password-policy message verbatim", async () => {
    updateUser.mockResolvedValue({
      error: { message: 'Password should be at least 6 characters.' }
    });
    const user = userEvent.setup();
    render(<ResetPasswordForm />);

    await fillAndSubmit(user, 'brandnewpassword1');

    expect(
      await screen.findByText('Password should be at least 6 characters.')
    ).toBeInTheDocument();
  });

  it('shows the expired/invalid-link state, with a link to request a new one, when the recovery session has expired mid-form', async () => {
    updateUser.mockResolvedValue({ error: { message: 'Auth session missing!' } });
    const user = userEvent.setup();
    render(<ResetPasswordForm />);

    await fillAndSubmit(user, 'brandnewpassword1');

    expect(await screen.findByText(RESET_LINK_INVALID_MESSAGE)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Request a new password reset link' })
    ).toBeInTheDocument();
  });

  it('never renders the typed password anywhere in a displayed error message', async () => {
    const typedPassword = 'brandnewpassword1';
    updateUser.mockResolvedValue({ error: { message: 'Something failed unexpectedly' } });
    const user = userEvent.setup();
    render(<ResetPasswordForm />);

    await fillAndSubmit(user, typedPassword);

    await waitFor(() =>
      expect(
        screen.getByText('We could not update your password. Please try again.')
      ).toBeInTheDocument()
    );
    expect(document.body.textContent).not.toContain(typedPassword);
  });
});

describe('ResetPasswordForm — loading state', () => {
  it('disables the submit button while the update is in flight', async () => {
    let resolveUpdate!: (value: { error: null }) => void;
    updateUser.mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      })
    );
    const user = userEvent.setup();
    render(<ResetPasswordForm />);

    await user.type(screen.getByLabelText(/^New password/), 'brandnewpassword1');
    await user.type(screen.getByLabelText(/^Confirm new password/), 'brandnewpassword1');
    const submit = screen.getByRole('button', { name: 'Update password' });
    await user.click(submit);

    await waitFor(() => expect(submit).toBeDisabled());
    resolveUpdate({ error: null });
  });
});
