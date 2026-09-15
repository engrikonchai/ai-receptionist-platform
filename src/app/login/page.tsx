import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AuthShell } from '@/features/auth/components/auth-shell';
import { LoginForm } from '@/features/auth/components/login-form';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
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
    const supabase = await createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase!.auth.getUser();
    if (user) {
      redirect(target);
    }
  }

  return (
    <AuthShell title='Sign in' description='Sign in to manage your business.'>
      <LoginForm next={target} initialError={error} />
    </AuthShell>
  );
}
