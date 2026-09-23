// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignupForm } from './signup-form';

const push = vi.fn();
const refresh = vi.fn();
const signUp = vi.fn();
const profilesUpdateEq = vi.fn();
const profilesUpdate = vi.fn(() => ({ eq: profilesUpdateEq }));
const from = vi.fn(() => ({ update: profilesUpdate }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh })
}));

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({ auth: { signUp }, from })
}));

vi.mock('@/lib/supabase/env', () => ({
  isSupabaseConfigured: () => true,
  SUPABASE_MISSING_ENV_MESSAGE: 'Supabase is not configured.'
}));

vi.mock('@/lib/site-url', () => ({
  getSiteUrl: () => 'https://app.example.com'
}));

const VALID_NAME = 'Jane Doe';
const VALID_EMAIL = 'owner@example.com';
const VALID_PASSWORD = 'longenough1';

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  overrides: { name?: string; email?: string; password?: string; confirmPassword?: string } = {}
) {
  await user.type(screen.getByLabelText(/^Display name/), overrides.name ?? VALID_NAME);
  await user.type(screen.getByLabelText(/^Email/), overrides.email ?? VALID_EMAIL);
  await user.type(screen.getByLabelText(/^Password/), overrides.password ?? VALID_PASSWORD);
  await user.type(
    screen.getByLabelText(/^Confirm password/),
    overrides.confirmPassword ?? overrides.password ?? VALID_PASSWORD
  );
  await user.click(screen.getByRole('button', { name: 'Create account' }));
}

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  signUp.mockReset();
  profilesUpdateEq.mockReset().mockResolvedValue({ error: null });
  profilesUpdate.mockClear();
  from.mockClear();
});

describe('SignupForm — successful submission', () => {
  it('calls signUp with email/password/display name and a redirect to /onboarding via the callback', async () => {
    signUp.mockResolvedValue({
      data: { session: { access_token: 'token' }, user: { id: 'user-1' } },
      error: null
    });
    const user = userEvent.setup();
    render(<SignupForm />);

    await fillAndSubmit(user);

    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
    expect(signUp).toHaveBeenCalledWith({
      email: VALID_EMAIL,
      password: VALID_PASSWORD,
      options: {
        data: { display_name: VALID_NAME },
        emailRedirectTo: 'https://app.example.com/auth/callback?next=%2Fonboarding'
      }
    });
  });

  it('when a session comes back immediately, personalizes the profile and redirects straight to /onboarding', async () => {
    signUp.mockResolvedValue({
      data: { session: { access_token: 'token' }, user: { id: 'user-1' } },
      error: null
    });
    const user = userEvent.setup();
    render(<SignupForm />);

    await fillAndSubmit(user);

    await waitFor(() => expect(from).toHaveBeenCalledWith('profiles'));
    expect(profilesUpdate).toHaveBeenCalledWith({ display_name: VALID_NAME });
    expect(profilesUpdateEq).toHaveBeenCalledWith('id', 'user-1');
    await waitFor(() => expect(push).toHaveBeenCalledWith('/onboarding'));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('when no session comes back (email confirmation required), shows the check-your-email state instead of redirecting', async () => {
    signUp.mockResolvedValue({ data: { session: null, user: null }, error: null });
    const user = userEvent.setup();
    render(<SignupForm />);

    await fillAndSubmit(user);

    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(screen.getByText(VALID_EMAIL)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
});

describe('SignupForm — client-side validation failure', () => {
  it('rejects a password shorter than 8 characters without ever calling signUp', async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    await fillAndSubmit(user, { password: 'short1', confirmPassword: 'short1' });

    expect(await screen.findByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('rejects mismatched passwords without ever calling signUp', async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    await fillAndSubmit(user, { password: 'longenough1', confirmPassword: 'longenough2' });

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('rejects an invalid email without ever calling signUp', async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    await fillAndSubmit(user, { email: 'not-an-email' });

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('rejects a blank display name without ever calling signUp', async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    // Leave displayName untouched — fillAndSubmit always types a value,
    // and the schema's min(1) does not trim, so a real blank submit
    // means never typing into the field at all.
    await user.type(screen.getByLabelText(/^Email/), VALID_EMAIL);
    await user.type(screen.getByLabelText(/^Password/), VALID_PASSWORD);
    await user.type(screen.getByLabelText(/^Confirm password/), VALID_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Enter your name.')).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });
});

describe('SignupForm — Supabase/auth failure', () => {
  it('shows a real signUp error as an alert instead of redirecting, and never touches the profile', async () => {
    signUp.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'User already registered' }
    });
    const user = userEvent.setup();
    render(<SignupForm />);

    await fillAndSubmit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('User already registered');
    expect(push).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(screen.queryByText('Check your email')).not.toBeInTheDocument();
  });

  it('passes through a rate-limit or other Supabase-specific auth error message verbatim, without redirecting', async () => {
    signUp.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'Email rate limit exceeded' }
    });
    const user = userEvent.setup();
    render(<SignupForm />);

    await fillAndSubmit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Email rate limit exceeded');
    expect(push).not.toHaveBeenCalled();
  });
});

describe('SignupForm — loading/disabled behavior', () => {
  it('disables the submit button while signUp is in flight', async () => {
    let resolveSignUp!: (value: { data: { session: null; user: null }; error: null }) => void;
    signUp.mockReturnValue(
      new Promise((resolve) => {
        resolveSignUp = resolve;
      })
    );
    const user = userEvent.setup();
    render(<SignupForm />);

    await user.type(screen.getByLabelText(/^Display name/), VALID_NAME);
    await user.type(screen.getByLabelText(/^Email/), VALID_EMAIL);
    await user.type(screen.getByLabelText(/^Password/), VALID_PASSWORD);
    await user.type(screen.getByLabelText(/^Confirm password/), VALID_PASSWORD);
    const submit = screen.getByRole('button', { name: 'Create account' });
    await user.click(submit);

    await waitFor(() => expect(submit).toBeDisabled());
    resolveSignUp({ data: { session: null, user: null }, error: null });
  });
});

describe('SignupForm — no sensitive values written to logs', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  function allLoggedText(): string {
    return [consoleErrorSpy, consoleWarnSpy, consoleLogSpy]
      .flatMap((spy) =>
        spy.mock.calls.map((call: unknown[]) =>
          call.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ')
        )
      )
      .join('\n');
  }

  it('never logs the typed password on a successful submission', async () => {
    signUp.mockResolvedValue({
      data: { session: { access_token: 'token' }, user: { id: 'user-1' } },
      error: null
    });
    const user = userEvent.setup();
    render(<SignupForm />);

    await fillAndSubmit(user);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/onboarding'));

    expect(allLoggedText()).not.toContain(VALID_PASSWORD);
  });

  it('never logs the typed password when signUp fails', async () => {
    signUp.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'User already registered' }
    });
    const user = userEvent.setup();
    render(<SignupForm />);

    await fillAndSubmit(user);
    await screen.findByRole('alert');

    expect(allLoggedText()).not.toContain(VALID_PASSWORD);
  });
});

describe('SignupForm — show/hide password', () => {
  it('toggles the password field independently of confirm password', async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    const password = screen.getByLabelText(/^Password/);
    const confirm = screen.getByLabelText(/^Confirm password/);
    expect(password).toHaveAttribute('type', 'password');
    expect(confirm).toHaveAttribute('type', 'password');

    await user.click(
      within(password.parentElement as HTMLElement).getByRole('button', { name: 'Show password' })
    );
    expect(password).toHaveAttribute('type', 'text');
    expect(confirm).toHaveAttribute('type', 'password');
  });
});
