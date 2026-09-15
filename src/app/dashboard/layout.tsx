import KBar from '@/components/kbar';
import AppSidebar from '@/components/layout/app-sidebar';
import Header from '@/components/layout/header';
import { InfoSidebar } from '@/components/layout/info-sidebar';
import { InfobarProvider } from '@/components/ui/infobar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { isSupabaseConfigured, SUPABASE_MISSING_ENV_MESSAGE } from '@/lib/supabase/env';
import {
  ACTIVE_BUSINESS_COOKIE,
  loadOwnerContext,
  resolveActiveBusinessId
} from '@/lib/supabase/owner-context';
import { AccountRecovery } from '@/features/auth/components/account-recovery';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Platform',
  description: 'AI receptionist platform dashboard',
  robots: {
    index: false,
    follow: false
  }
};

// The dashboard is always per-user, cookie-authenticated content — never
// prerender or statically cache it.
export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) {
    return (
      <div className='flex min-h-screen items-center justify-center p-4'>
        <div className='border-destructive/30 bg-destructive/10 max-w-md rounded-2xl border p-6 text-sm'>
          <p className='text-foreground font-semibold'>Dev only — Supabase not configured</p>
          <p className='text-muted-foreground mt-2'>{SUPABASE_MISSING_ENV_MESSAGE}</p>
        </div>
      </div>
    );
  }

  // The real authorization boundary for every /dashboard route. proxy.ts
  // also does an optimistic redirect for a snappier "logged out" bounce,
  // but per Next's own guidance that's a fast-path convenience only —
  // this Server Component re-checks the session on every request and is
  // what actually keeps the dashboard private.
  const ctx = await loadOwnerContext();

  if (ctx.status === 'unauthenticated') {
    redirect('/login?next=/dashboard/overview');
  }

  // No profile and/or no business yet — never a redirect loop with
  // /onboarding, which hits the exact same case and shows the same
  // recovery state instead of bouncing back here.
  if (ctx.status === 'incomplete_profile') {
    return <AccountRecovery email={ctx.user.email ?? undefined} />;
  }

  if (!ctx.profile.onboarding_completed) {
    redirect('/onboarding');
  }

  const { user, profile, businesses } = ctx;

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get('sidebar_state')?.value === 'true';

  const initialActiveBusinessId = resolveActiveBusinessId(
    businesses,
    cookieStore.get(ACTIVE_BUSINESS_COOKIE)?.value
  );

  return (
    <KBar>
      <SidebarProvider defaultOpen={defaultOpen}>
        <a
          href='#main-content'
          className='bg-background ring-ring sr-only rounded-md px-3 py-2 text-sm font-medium shadow focus:not-sr-only focus:absolute focus:top-2 focus:start-2 focus:z-50 focus:ring-2'
        >
          Skip to content
        </a>
        <AppSidebar
          ownerEmail={user.email ?? ''}
          profile={profile}
          businesses={businesses}
          initialActiveBusinessId={initialActiveBusinessId}
        />
        <SidebarInset id='main-content' tabIndex={-1} className='scroll-mt-16'>
          <Header />
          <InfobarProvider defaultOpen={false}>
            {children}
            <InfoSidebar side='right' />
          </InfobarProvider>
        </SidebarInset>
      </SidebarProvider>
    </KBar>
  );
}
