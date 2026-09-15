'use client';

/**
 * TEMPORARY MOCK COMPONENT
 * ------------------------
 * Placeholder for the real business/workspace switcher. There is no
 * multi-business support yet — this just displays a fixed demo business
 * name in the sidebar header so the shell doesn't look bare. It is not
 * wired to any data and does nothing when clicked.
 *
 * Replace this once real business/workspace data (Supabase) exists.
 */

import { Icons } from '@/components/icons';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';

const MOCK_BUSINESS_NAME = 'Demo Business';

export function MockBusinessSwitcher() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size='lg' className='cursor-default' disabled>
          <div className='bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg'>
            <Icons.workspace className='size-4' />
          </div>
          <div className='grid flex-1 text-left text-sm leading-tight'>
            <span className='truncate font-medium'>{MOCK_BUSINESS_NAME}</span>
            <span className='text-muted-foreground truncate text-xs'>Mock workspace</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
