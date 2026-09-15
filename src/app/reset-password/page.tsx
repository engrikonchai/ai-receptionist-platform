import type { Metadata } from 'next';
import { AuthShell } from '@/features/auth/components/auth-shell';
import { ResetPasswordForm } from '@/features/auth/components/reset-password-form';
import { ResetPasswordInvalidLink } from '@/features/auth/components/reset-password-invalid-link';
import { SupabaseConfigNotice } from '@/features/auth/components/supabase-config-notice';
import { isSupabaseConfigured, SUPABASE_MISSING_ENV_MESSAGE } from '@/lib/supabase/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Reset password'
};

export const dynamic = 'force-dynamic';

export default async function ResetPasswordPage() {
  if (!isSupabaseConfigured()) {
    return (
      <AuthShell title='Reset password' description='Choose a new password for your account.'>
        <SupabaseConfigNotice message={SUPABASE_MISSING_ENV_MESSAGE} />
      </AuthShell>
    );
  }

  // /auth/callback already exchanged the recovery link's code for a
  // session and wrote it to cookies before redirecting here — this is
  // the same cookie-authenticated check every other server-rendered
  // page in this app uses (see dashboard/layout.tsx). No session means
  // no valid recovery link: never render the form in that case.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase!.auth.getUser();

  if (!user) {
    return (
      <AuthShell
        title='Reset link expired'
        description='This password reset link is invalid or has expired.'
      >
        <ResetPasswordInvalidLink />
      </AuthShell>
    );
  }

  return (
    <AuthShell title='Choose a new password' description='Enter a new password for your account.'>
      <ResetPasswordForm />
    </AuthShell>
  );
}
