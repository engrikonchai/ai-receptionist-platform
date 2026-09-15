'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icons } from '@/components/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import type { BusinessRow } from '@/lib/supabase/database.types';

const ACTIVE_BUSINESS_COOKIE = 'active_business_id';

function setActiveBusinessCookie(businessId: string) {
  if (typeof window === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? 'Secure;' : '';
  document.cookie = `${ACTIVE_BUSINESS_COOKIE}=${businessId}; path=/; max-age=31536000; SameSite=Lax; ${secure}`;
}

export function BusinessSwitcher({
  businesses,
  initialActiveBusinessId
}: {
  businesses: BusinessRow[];
  initialActiveBusinessId: string | null;
}) {
  // `businesses` only ever contains rows Row Level Security already
  // scoped to the signed-in owner, so any id picked from this list is
  // guaranteed to belong to them — this is the "verify" step.
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(
    initialActiveBusinessId && businesses.some((b) => b.id === initialActiveBusinessId)
      ? initialActiveBusinessId
      : (businesses[0]?.id ?? null)
  );

  const active = businesses.find((b) => b.id === activeId) ?? businesses[0] ?? null;

  function handleSelect(businessId: string) {
    if (!businesses.some((b) => b.id === businessId)) return;
    if (businessId === activeId) return;
    setActiveId(businessId);
    setActiveBusinessCookie(businessId);
    // Every business-scoped page (Overview, Inbox, ...) resolves the
    // active business from this cookie on the server, so a plain client
    // state update wouldn't be enough to make them reflect the new
    // business — refresh re-runs their Server Components against the
    // cookie value just written above.
    router.refresh();
  }

  if (!active) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size='lg' disabled className='cursor-default'>
            <div className='bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg'>
              <Icons.workspace className='size-4' />
            </div>
            <div className='grid flex-1 text-left text-sm leading-tight'>
              <span className='truncate font-medium'>No business found</span>
              <span className='text-muted-foreground truncate text-xs'>
                Contact support if this persists
              </span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
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
              <Icons.workspace className='size-4' />
            </div>
            <div className='grid flex-1 text-left text-sm leading-tight'>
              <span className='truncate font-medium'>{active.name}</span>
              <span className='text-muted-foreground truncate text-xs'>Business</span>
            </div>
            {businesses.length > 1 && <Icons.chevronsDown className='ml-auto size-4' />}
          </DropdownMenuTrigger>
          {businesses.length > 1 && (
            <DropdownMenuContent
              className='w-(--anchor-width) min-w-56 rounded-lg'
              side='bottom'
              align='start'
              sideOffset={4}
            >
              <DropdownMenuLabel className='text-muted-foreground text-xs'>
                Businesses
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {businesses.map((business) => (
                <DropdownMenuItem key={business.id} onClick={() => handleSelect(business.id)}>
                  <Icons.workspace className='size-4' aria-hidden='true' />
                  <span className='flex-1 truncate'>{business.name}</span>
                  {business.id === active.id && (
                    <Icons.check className='size-4' aria-hidden='true' />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          )}
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
