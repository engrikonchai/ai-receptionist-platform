import type { Metadata } from 'next';
import { DaylightAuthShell } from '@/features/auth/components/daylight/daylight-auth-shell';
import { DaylightConfigNotice } from '@/features/auth/components/daylight/daylight-config-notice';
import { DaylightInvalidLink } from '@/features/auth/components/daylight/daylight-invalid-link';
import { ResetPasswordForm } from '@/features/auth/components/reset-password-form';
import { isSupabaseConfigured, SUPABASE_MISSING_ENV_MESSAGE } from '@/lib/supabase/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Reset password'
};

export const dynamic = 'force-dynamic';

export default async function ResetPasswordPage() {
  if (!isSupabaseConfigured()) {
    return (
      <DaylightAuthShell
        title='Reset password'
        description='Choose a new password for your account.'
      >
        <DaylightConfigNotice message={SUPABASE_MISSING_ENV_MESSAGE} />
      </DaylightAuthShell>
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
      <DaylightAuthShell
        title='Reset link expired'
        description='This password reset link is invalid or has expired.'
      >
        <DaylightInvalidLink />
      </DaylightAuthShell>
    );
  }

  return (
    <DaylightAuthShell
      title='Choose a new password'
      description='Enter a new password for your account.'
    >
      <ResetPasswordForm />
    </DaylightAuthShell>
  );
}
