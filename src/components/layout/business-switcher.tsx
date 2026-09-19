import { Icons } from '@/components/icons';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import type { BusinessRow } from '@/lib/supabase/database.types';

/**
 * V1 product rule: one owner account owns exactly one business (see
 * supabase/migrations/20260921090000_single_business_per_owner.sql and
 * OwnerContext's own doc comment) — this is a plain business-identity
 * display, never a switcher. No dropdown, no "Add business", no way to
 * select a different business, because there is never more than one to
 * select. `businesses` holding more than one row is the
 * `multiple_businesses` fail-closed case, handled upstream in
 * dashboard/layout.tsx (a safe generic error page renders instead of
 * the dashboard at all) — by the time this component renders,
 * `businesses` holds at most one row. Multi-business switching is out
 * of scope for V1; reintroducing it is a deliberate future change, not
 * a prop this component still quietly supports.
 */
export function BusinessSwitcher({ businesses }: { businesses: BusinessRow[] }) {
  const active = businesses[0] ?? null;

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
        <SidebarMenuButton size='lg' disabled className='cursor-default'>
          <div className='bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg'>
            <Icons.workspace className='size-4' />
          </div>
          <div className='grid flex-1 text-left text-sm leading-tight'>
            <span className='truncate font-medium'>{active.name}</span>
            <span className='text-muted-foreground truncate text-xs'>Business</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
