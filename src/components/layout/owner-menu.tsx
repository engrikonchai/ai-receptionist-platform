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
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { ProfileRow } from '@/lib/supabase/database.types';

export function OwnerMenu({ email, profile }: { email: string; profile: ProfileRow | null }) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const displayName = profile?.display_name?.trim() || email || 'Account';

  async function handleSignOut() {
    setIsSigningOut(true);
    const supabase = createSupabaseBrowserClient();
    await supabase?.auth.signOut();
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
            <div className='bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg'>
              <Icons.user2 className='size-4' />
            </div>
            <div className='grid flex-1 text-left text-sm leading-tight'>
              <span className='truncate font-medium'>{displayName}</span>
              <span className='text-muted-foreground truncate text-xs'>{email}</span>
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
