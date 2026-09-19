'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { clearActiveBusinessCookie } from '@/lib/active-business-cookie';
import { getQueryClient } from '@/lib/query-client';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { AuthShell } from './auth-shell';

const VARIANT_COPY = {
  no_business: {
    title: "We couldn't load your account",
    description: "Your sign-in worked, but we couldn't find a business linked to it yet.",
    detail: 'This usually resolves itself moments after signing up.'
  },
  // Should be unreachable once
  // supabase/migrations/20260921090000_single_business_per_owner.sql has
  // been applied — see OwnerContext's `multiple_businesses` status.
  // Deliberately as generic as the no_business case: never names a
  // business, an id, or a count in this user-facing copy.
  multiple_businesses: {
    title: "We couldn't load your account",
    description: 'Your account is in an unexpected state and needs a quick check on our end.',
    detail: 'This is usually temporary.'
  }
} as const;

/**
 * Shown instead of redirecting when a signed-in user's account is in a
 * state this app can't safely proceed from — no profile and/or no
 * business row yet (the onboarding trigger hasn't fired, or fired only
 * partially; `variant='no_business'`, the default), or unexpectedly
 * more than one owned business (`variant='multiple_businesses'`, the
 * V1 single-business-per-owner rule's fail-closed case — see
 * OwnerContext's own doc comment). Bouncing either case between
 * /dashboard and /onboarding would be an infinite redirect loop, and
 * silently picking a business in the second case would be exactly the
 * "arbitrary business" behavior that rule forbids — so both render
 * this same plain, safe error state instead.
 */
export function AccountRecovery({
  email,
  variant = 'no_business'
}: {
  email?: string;
  variant?: 'no_business' | 'multiple_businesses';
}) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const copy = VARIANT_COPY[variant];

  async function handleSignOut() {
    setIsSigningOut(true);
    const supabase = createSupabaseBrowserClient();
    await supabase?.auth.signOut();

    // Same reasoning as OwnerMenu's sign-out: this browser tab's
    // QueryClient and the active-business cookie are both long-lived and
    // must never carry this account's state into whichever account
    // signs in next in this same tab.
    getQueryClient().clear();
    clearActiveBusinessCookie();

    router.push('/login');
    router.refresh();
  }

  return (
    <AuthShell title={copy.title} description={copy.description}>
      <div className='space-y-4 text-sm'>
        <p className='text-muted-foreground'>
          {email ? (
            <>
              Signed in as <span className='text-foreground font-medium'>{email}</span>.{' '}
              {copy.detail}
            </>
          ) : (
            copy.detail
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
