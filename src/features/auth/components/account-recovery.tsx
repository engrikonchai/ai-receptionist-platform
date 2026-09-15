'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { AuthShell } from './auth-shell';

/**
 * Shown instead of redirecting when a signed-in user has no profile
 * and/or no business row yet (the onboarding trigger hasn't fired, or
 * fired only partially) — bouncing this case between /dashboard and
 * /onboarding would be an infinite redirect loop, so this breaks it
 * with a plain, safe error state instead.
 */
export function AccountRecovery({ email }: { email?: string }) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    const supabase = createSupabaseBrowserClient();
    await supabase?.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <AuthShell
      title="We couldn't load your account"
      description="Your sign-in worked, but we couldn't find a business linked to it yet."
    >
      <div className='space-y-4 text-sm'>
        <p className='text-muted-foreground'>
          {email ? (
            <>
              Signed in as <span className='text-foreground font-medium'>{email}</span>. This
              usually resolves itself moments after signing up.
            </>
          ) : (
            'This usually resolves itself moments after signing up.'
          )}{' '}
          If it persists, please contact support.
        </p>
        <div className='flex flex-col gap-2'>
          <Button className='w-full' onClick={() => router.refresh()}>
            <Icons.arrowBackUp className='size-4' aria-hidden='true' />
            Try again
          </Button>
          <Button
            variant='outline'
            className='w-full'
            onClick={handleSignOut}
            disabled={isSigningOut}
          >
            {isSigningOut ? 'Signing out…' : 'Sign out'}
          </Button>
        </div>
      </div>
    </AuthShell>
  );
}
