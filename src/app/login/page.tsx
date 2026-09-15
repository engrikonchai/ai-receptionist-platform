import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AuthShell } from '@/features/auth/components/auth-shell';
import { LoginForm } from '@/features/auth/components/login-form';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { loadOwnerContext } from '@/lib/supabase/owner-context';
import { resolveSafeNextPath } from '@/lib/safe-redirect';

export const metadata: Metadata = {
  title: 'Sign in'
};

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const target = resolveSafeNextPath(next);

  if (isSupabaseConfigured()) {
    const ctx = await loadOwnerContext();
    // Authenticated + onboarding not finished → /onboarding, never
    // straight to the dashboard. Authenticated with no profile/business
    // yet → /onboarding too, which shows the safe recovery state for
    // that exact case (single place owns that UI).
    if (ctx.status === 'ok') {
      redirect(ctx.profile.onboarding_completed ? target : '/onboarding');
    } else if (ctx.status === 'incomplete_profile') {
      redirect('/onboarding');
    }
  }

  return (
    <AuthShell title='Sign in' description='Sign in to manage your business.'>
      <LoginForm next={target} initialError={error} />
    </AuthShell>
  );
}
