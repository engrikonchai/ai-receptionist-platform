'use client';

/**
 * TEMPORARY MOCK COMPONENT
 * ------------------------
 * Placeholder for the real signed-in user menu. There is no authentication
 * yet — this always shows a fixed "Demo Owner" identity so the dashboard
 * shell has an account affordance in the sidebar footer. The menu items
 * are inert; nothing here reads or writes real session/user data.
 *
 * Replace this once Supabase auth is wired up.
 */

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

const MOCK_OWNER = {
  name: 'Demo Owner',
  email: 'owner@example.com'
};

export function MockOwnerMenu() {
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
              <span className='truncate font-medium'>{MOCK_OWNER.name}</span>
              <span className='text-muted-foreground truncate text-xs'>{MOCK_OWNER.email}</span>
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
                  <p className='text-sm leading-none font-medium'>{MOCK_OWNER.name}</p>
                  <p className='text-muted-foreground text-xs leading-none'>{MOCK_OWNER.email}</p>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem disabled>
                Profile
                <span className='text-muted-foreground ml-auto text-xs'>Not available yet</span>
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                Sign out
                <span className='text-muted-foreground ml-auto text-xs'>No auth yet</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
