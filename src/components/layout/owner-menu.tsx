'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icons } from '@/components/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { clearActiveBusinessCookie } from '@/lib/active-business-cookie';
import { getQueryClient } from '@/lib/query-client';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { ProfileRow } from '@/lib/supabase/database.types';

export function OwnerMenu({ email, profile }: { email: string; profile: ProfileRow | null }) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const displayName = profile?.display_name?.trim() || email || 'Account';
  // Shell anatomy footer row: circle avatar with initials + name + role
  // label ("Owner" — the real, single-owner-model role, not a fictional
  // team-member title) rather than the generic user-icon square this
  // component started from. Full email stays reachable in the opened
  // menu's own label below; an sr-only span keeps it in this trigger's
  // accessible name too, matching the account context screen readers and
  // existing tests already rely on.
  const initials = /\s/.test(displayName)
    ? displayName
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0])
        .join('')
        .toUpperCase()
    : displayName.slice(0, 2).toUpperCase();

  async function handleSignOut() {
    setIsSigningOut(true);
    const supabase = createSupabaseBrowserClient();
    await supabase?.auth.signOut();

    // This browser tab's QueryClient is a long-lived singleton (see
    // getQueryClient()) that would otherwise outlive this sign-out —
    // without clearing it, every business- and user-scoped query this
    // owner ever loaded (Inbox conversations, Knowledge items, ...)
    // stays cached in memory and could be served to whichever account
    // signs in next in this same tab. The active-business cookie is
    // long-lived for the same reason (see active-business-cookie.ts) and
    // must not carry a business id from the account that just signed out
    // into the next owner's session.
    getQueryClient().clear();
    clearActiveBusinessCookie();

    router.push('/login');
    router.refresh();
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size='lg'
                className='data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground'
              />
            }
          >
            <div className='bg-chart-2 text-foreground flex aspect-square size-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold'>
              {initials}
            </div>
            <div className='grid flex-1 text-left text-sm leading-tight'>
              <span className='truncate font-bold'>{displayName}</span>
              <span className='text-muted-foreground truncate text-xs'>
                Owner
                <span className='sr-only'> · {email}</span>
              </span>
            </div>
            <Icons.chevronsDown className='ml-auto size-4' />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className='w-(--anchor-width) min-w-56 rounded-lg'
            side='bottom'
            align='end'
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className='p-0 font-normal'>
                <div className='flex flex-col space-y-1 px-1 py-1.5'>
                  <p className='text-sm leading-none font-medium'>{displayName}</p>
                  <p className='text-muted-foreground text-xs leading-none'>{email}</p>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={handleSignOut} disabled={isSigningOut}>
                <Icons.logout className='size-4' aria-hidden='true' />
                {isSigningOut ? 'Signing out…' : 'Sign out'}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
