'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icons } from '@/components/icons';
import { useSidebar } from '@/components/ui/sidebar';
import { useNavBadgeCounts } from '@/hooks/use-nav-badge-counts';
import { useInboxStore } from '@/features/inbox/utils/store';
import { cn } from '@/lib/utils';

const TABS = [
  { title: 'Overview', url: '/dashboard/overview', icon: Icons.dashboard },
  { title: 'Inbox', url: '/dashboard/inbox', icon: Icons.chat, badge: 'pendingHandoffCount' },
  { title: 'Leads', url: '/dashboard/leads', icon: Icons.leads, badge: 'newLeadCount' },
  { title: 'Knowledge', url: '/dashboard/knowledge', icon: Icons.knowledge }
] as const;

function TabBar({ businessId }: { businessId: string | null }) {
  const pathname = usePathname();
  const mobileView = useInboxStore((state) => state.mobileView);
  const { setOpenMobile } = useSidebar();
  const counts = useNavBadgeCounts(businessId);

  // An open conversation is a full-screen task on a phone — the composer
  // owns the bottom edge, so the tab bar steps aside until the owner
  // goes back to the list.
  const inOpenConversation = pathname.startsWith('/dashboard/inbox') && mobileView === 'thread';
  if (inOpenConversation) return null;

  return (
    <nav
      aria-label='Primary'
      className='bg-sidebar/95 border-border fixed inset-x-0 bottom-0 z-30 flex border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden'
    >
      {TABS.map((tab) => {
        const active = pathname === tab.url || pathname.startsWith(`${tab.url}/`);
        const count = 'badge' in tab ? counts[tab.badge] : 0;
        return (
          <Link
            key={tab.title}
            href={tab.url}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex min-h-14 flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 text-[11px] font-bold select-none',
              active ? 'text-accent-foreground' : 'text-muted-foreground'
            )}
          >
            <span
              className={cn(
                'relative flex h-7 w-12 items-center justify-center rounded-full transition-colors',
                active && 'bg-accent'
              )}
            >
              <tab.icon className='size-5' strokeWidth={active ? 2.25 : 1.75} aria-hidden='true' />
              {count > 0 && (
                <span
                  aria-label={`${count} ${tab.title === 'Inbox' ? 'pending handoffs' : 'new leads'}`}
                  className={cn(
                    'absolute -top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-extrabold',
                    tab.title === 'Inbox'
                      ? 'bg-status-attention text-status-attention-soft'
                      : 'bg-primary text-primary-foreground'
                  )}
                >
                  {count}
                </span>
              )}
            </span>
            {tab.title}
          </Link>
        );
      })}
      <button
        type='button'
        onClick={() => setOpenMobile(true)}
        className='text-muted-foreground flex min-h-14 flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 text-[11px] font-bold select-none'
      >
        <span className='flex h-7 w-12 items-center justify-center'>
          <Icons.menu className='size-5' strokeWidth={1.75} aria-hidden='true' />
        </span>
        More
      </button>
    </nav>
  );
}

export function MobileTabBar({ businessId }: { businessId: string | null }) {
  return <TabBar businessId={businessId} />;
}
