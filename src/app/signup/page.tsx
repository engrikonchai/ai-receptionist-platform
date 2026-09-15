import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AuthShell } from '@/features/auth/components/auth-shell';
import { SignupForm } from '@/features/auth/components/signup-form';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';

export const metadata: Metadata = {
  title: 'Sign up'
};

export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase!.auth.getUser();
    if (user) {
      redirect('/dashboard/overview');
    }
  }

  return (
    <AuthShell title='Create your account' description='Set up owner access for your business.'>
      <SignupForm />
    </AuthShell>
  );
}
