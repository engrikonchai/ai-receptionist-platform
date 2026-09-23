import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { DaylightAuthShell } from '@/features/auth/components/daylight/daylight-auth-shell';
import { SignupForm } from '@/features/auth/components/signup-form';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { loadOwnerContext } from '@/lib/supabase/owner-context';

export const metadata: Metadata = {
  title: 'Sign up'
};

export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  if (isSupabaseConfigured()) {
    const ctx = await loadOwnerContext();
    if (ctx.status === 'ok') {
      redirect(ctx.profile.onboarding_completed ? '/dashboard/overview' : '/onboarding');
    } else if (ctx.status === 'incomplete_profile') {
      redirect('/onboarding');
    }
  }

  return (
    <DaylightAuthShell
      title='Create your account'
      description='Set up owner access for your business.'
    >
      <SignupForm />
    </DaylightAuthShell>
  );
}
