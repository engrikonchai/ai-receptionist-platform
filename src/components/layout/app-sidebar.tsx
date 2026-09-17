'use client';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar
} from '@/components/ui/sidebar';
import { navGroups } from '@/config/nav-config';
import { useFilteredNavGroups } from '@/hooks/use-nav';
import { useNavBadgeCounts } from '@/hooks/use-nav-badge-counts';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { Icons } from '@/components/icons';
import { BusinessSwitcher } from '@/components/layout/business-switcher';
import { OwnerMenu } from '@/components/layout/owner-menu';
import type { BusinessRow, ProfileRow } from '@/lib/supabase/database.types';

/** Nav item titles a live badge count applies to — see use-nav-badge-counts.ts. Matched by title rather than a new field on NavItem/nav-config.ts, which has no badge slot and is otherwise plain shared config. */
const NAV_BADGE_COUNT: Record<string, 'pendingHandoffCount' | 'newLeadCount'> = {
  Inbox: 'pendingHandoffCount',
  Leads: 'newLeadCount'
};

export default function AppSidebar({
  ownerEmail,
  profile,
  businesses,
  initialActiveBusinessId
}: {
  ownerEmail: string;
  profile: ProfileRow | null;
  businesses: BusinessRow[];
  initialActiveBusinessId: string | null;
}) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const filteredGroups = useFilteredNavGroups(navGroups);

  // Owned here (not inside BusinessSwitcher) so the same id can also
  // scope useNavBadgeCounts()'s queries below — both need to agree on
  // which business is active.
  const [activeBusinessId, setActiveBusinessId] = React.useState<string | null>(
    initialActiveBusinessId && businesses.some((b) => b.id === initialActiveBusinessId)
      ? initialActiveBusinessId
      : (businesses[0]?.id ?? null)
  );

  const { pendingHandoffCount, newLeadCount } = useNavBadgeCounts(activeBusinessId);
  const badgeCountByKind = { pendingHandoffCount, newLeadCount };

  // On mobile, the sidebar renders as an overlay Sheet (see ui/sidebar.tsx).
  // dashboard/layout.tsx's SidebarProvider is shared across every
  // /dashboard/* route, so a same-layout client-side navigation (e.g.
  // tapping "Widget" while on Inbox) does NOT remount it — `openMobile`
  // carries over unchanged. Without this, the Sheet stays open and
  // visually covers the page the Link just navigated to, so the tap
  // looks like it "did nothing" even though the URL underneath already
  // changed. Only closes on mobile — desktop's persistent sidebar column
  // isn't a modal overlay and has nothing to close.
  const closeMobileSidebar = React.useCallback(() => {
    if (isMobile) setOpenMobile(false);
  }, [isMobile, setOpenMobile]);

  return (
    <Sidebar collapsible='icon'>
      <SidebarHeader>
        <BusinessSwitcher
          businesses={businesses}
          activeBusinessId={activeBusinessId}
          onActiveBusinessIdChange={setActiveBusinessId}
        />
      </SidebarHeader>
      <SidebarContent className='overflow-x-hidden'>
        {filteredGroups.map((group) => (
          <SidebarGroup key={group.label || 'ungrouped'} className='py-0'>
            {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
            <SidebarMenu>
              {group.items.map((item) => {
                const Icon = item.icon ? Icons[item.icon] : Icons.logo;
                return item?.items && item?.items?.length > 0 ? (
                  <Collapsible
                    key={item.title}
                    defaultOpen={item.isActive}
                    render={<SidebarMenuItem />}
                  >
                    <CollapsibleTrigger
                      render={
                        <SidebarMenuButton
                          tooltip={item.title}
                          isActive={pathname === item.url}
                          className='group/collapsible'
                        />
                      }
                    >
                      {item.icon && <Icon />}
                      <span>{item.title}</span>
                      <Icons.chevronRight className='ml-auto transition-transform duration-200 group-data-panel-open/collapsible:rotate-90' />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {item.items?.map((subItem) => (
                          <SidebarMenuSubItem key={subItem.title}>
                            <SidebarMenuSubButton
                              render={
                                <Link
                                  href={subItem.url}
                                  aria-label={subItem.title}
                                  onClick={closeMobileSidebar}
                                />
                              }
                              isActive={pathname === subItem.url}
                            >
                              <span>{subItem.title}</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </Collapsible>
                ) : (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      render={
                        <Link
                          href={item.url}
                          aria-label={item.title}
                          onClick={closeMobileSidebar}
                        />
                      }
                      tooltip={item.title}
                      isActive={pathname === item.url}
                    >
                      <Icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                    {NAV_BADGE_COUNT[item.title] &&
                      badgeCountByKind[NAV_BADGE_COUNT[item.title]] > 0 && (
                        <SidebarMenuBadge
                          aria-label={`${badgeCountByKind[NAV_BADGE_COUNT[item.title]]} ${
                            item.title === 'Inbox' ? 'pending handoffs' : 'new leads'
                          }`}
                        >
                          {badgeCountByKind[NAV_BADGE_COUNT[item.title]]}
                        </SidebarMenuBadge>
                      )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <OwnerMenu email={ownerEmail} profile={profile} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
