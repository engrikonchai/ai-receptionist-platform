'use client';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  SidebarSeparator,
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
import { cn } from '@/lib/utils';
import type { BusinessRow, ProfileRow } from '@/lib/supabase/database.types';

/** Nav item titles a live badge count applies to — see use-nav-badge-counts.ts. Matched by title rather than a new field on NavItem/nav-config.ts, which has no badge slot and is otherwise plain shared config. */
const NAV_BADGE_COUNT: Record<string, 'pendingHandoffCount' | 'newLeadCount'> = {
  Inbox: 'pendingHandoffCount',
  Leads: 'newLeadCount'
};

/**
 * A route counts as "active" for its own exact URL, or for any deeper
 * path beneath it (e.g. a future `/dashboard/leads/123` correctly keeps
 * "Leads" highlighted) — never a bare string-prefix match, which would
 * wrongly light up "Leads" while on an unrelated `/dashboard/leads-archive`.
 * No current route in this app is actually nested, so today this
 * behaves identically to an exact match; it's here so the sidebar stays
 * correct the moment one is added.
 */
function isNavItemActive(pathname: string, url: string) {
  return pathname === url || pathname.startsWith(`${url}/`);
}

/** The active-state "inset bar" component rule from the approved Daylight
 * design export (Handoff.dc.html's "COMPONENT RULES" table: "active =
 * indigo text + tint fill + 3px inset left bar") — paired with the
 * existing bold/tint/color treatment `sidebarMenuButtonVariants` already
 * applies via `data-active`, never color alone. */
const ACTIVE_NAV_INSET_BAR = 'shadow-[inset_3px_0_0_var(--sidebar-accent-foreground)]';

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

  // Renders the mobile Sheet's portal inside `.daylight-dashboard` (the
  // `id` dashboard/layout.tsx's SidebarProvider carries) rather than
  // Base UI's default `document.body` target, which sits outside that
  // scope and would silently fall back to the dashboard's plain Zen
  // colors for the whole drawer — the same portal-escapes-the-scope
  // issue Milestone 1 solved for the marketing mobile nav (see
  // mobile-nav.tsx). `document` doesn't exist during SSR, hence the
  // guard; on the client it resolves synchronously since hydration
  // attaches to already-server-rendered DOM.
  const [portalContainer] = React.useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.getElementById('daylight-dashboard-root')
  );

  // V1: one owner, one business — there is no switcher to change this
  // after mount, so a plain derived value is enough (no state needed).
  // `initialActiveBusinessId` (from dashboard/layout.tsx's
  // resolveActiveBusinessId()) already only ever resolves to one of
  // this owner's own `businesses`, but re-verified here too so
  // useNavBadgeCounts() below can never scope its queries to a stale
  // id that doesn't match the businesses this render actually has.
  const activeBusinessId =
    initialActiveBusinessId && businesses.some((b) => b.id === initialActiveBusinessId)
      ? initialActiveBusinessId
      : (businesses[0]?.id ?? null);

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
    <Sidebar collapsible='icon' container={portalContainer}>
      <SidebarHeader>
        <Link
          href='/dashboard/overview'
          aria-label='Platform — go to Overview'
          className='focus-visible:outline-ring flex items-center gap-2.5 px-1 focus-visible:outline-2 focus-visible:outline-offset-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0'
        >
          <span className='bg-sidebar-primary text-sidebar-primary-foreground flex size-6.5 shrink-0 items-center justify-center rounded-[9px]'>
            <Icons.logo className='size-3.5' aria-hidden='true' />
          </span>
          <span className='text-foreground truncate text-[16px] font-extrabold tracking-[-0.01em] group-data-[collapsible=icon]:hidden'>
            Platform
          </span>
        </Link>
        <BusinessSwitcher businesses={businesses} />
      </SidebarHeader>
      <SidebarContent className='overflow-x-hidden'>
        {filteredGroups.map((group, groupIndex) => (
          <React.Fragment key={group.label || 'ungrouped'}>
            {/* Component Rules table shows a single 1px divider between
                the product-feature nav items and the account-area items
                (Team/Settings/Billing) — never a visible text label like
                "Main"/"Workspace" — so the group boundary is marked with
                a hairline instead of SidebarGroupLabel. */}
            {groupIndex > 0 && <SidebarSeparator className='my-2' />}
            <SidebarGroup className='gap-1 py-0'>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon ? Icons[item.icon] : Icons.logo;
                  const hasSubItems = item?.items && item.items.length > 0;
                  const parentActive =
                    hasSubItems && item.items!.some((sub) => isNavItemActive(pathname, sub.url));
                  return hasSubItems ? (
                    <Collapsible
                      key={item.title}
                      defaultOpen={item.isActive || parentActive}
                      render={<SidebarMenuItem />}
                    >
                      <CollapsibleTrigger
                        render={
                          <SidebarMenuButton
                            tooltip={item.title}
                            isActive={parentActive}
                            className={cn(
                              'group/collapsible',
                              parentActive && ACTIVE_NAV_INSET_BAR
                            )}
                          />
                        }
                      >
                        {item.icon && <Icon />}
                        <span>{item.title}</span>
                        <Icons.chevronRight className='ml-auto transition-transform duration-200 group-data-panel-open/collapsible:rotate-90' />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {item.items?.map((subItem) => {
                            const subActive = isNavItemActive(pathname, subItem.url);
                            return (
                              <SidebarMenuSubItem key={subItem.title}>
                                <SidebarMenuSubButton
                                  render={
                                    <Link
                                      href={subItem.url}
                                      aria-label={subItem.title}
                                      onClick={closeMobileSidebar}
                                    />
                                  }
                                  isActive={subActive}
                                  className={cn(subActive && ACTIVE_NAV_INSET_BAR)}
                                >
                                  <span>{subItem.title}</span>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          })}
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
                            aria-current={isNavItemActive(pathname, item.url) ? 'page' : undefined}
                            onClick={closeMobileSidebar}
                          />
                        }
                        tooltip={item.title}
                        isActive={isNavItemActive(pathname, item.url)}
                        className={cn(isNavItemActive(pathname, item.url) && ACTIVE_NAV_INSET_BAR)}
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
          </React.Fragment>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <OwnerMenu email={ownerEmail} profile={profile} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
