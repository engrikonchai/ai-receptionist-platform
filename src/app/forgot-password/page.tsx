import type { Metadata } from 'next';
import { DaylightAuthShell } from '@/features/auth/components/daylight/daylight-auth-shell';
import { ForgotPasswordForm } from '@/features/auth/components/forgot-password-form';

export const metadata: Metadata = {
  title: 'Forgot password'
};

export const dynamic = 'force-dynamic';

export default function ForgotPasswordPage() {
  return (
    <DaylightAuthShell
      title='Forgot your password?'
      description="Enter your email and we'll send you a link to reset it."
    >
      <ForgotPasswordForm />
    </DaylightAuthShell>
  );
}
