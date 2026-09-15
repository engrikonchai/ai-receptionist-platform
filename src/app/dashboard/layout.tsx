import KBar from '@/components/kbar';
import AppSidebar from '@/components/layout/app-sidebar';
import Header from '@/components/layout/header';
import { InfoSidebar } from '@/components/layout/info-sidebar';
import { InfobarProvider } from '@/components/ui/infobar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isSupabaseConfigured, SUPABASE_MISSING_ENV_MESSAGE } from '@/lib/supabase/env';
import type { BusinessRow, ProfileRow } from '@/lib/supabase/database.types';
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

const ACTIVE_BUSINESS_COOKIE = 'active_business_id';

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
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase!.auth.getUser();

  if (!user) {
    redirect('/login?next=/dashboard/overview');
  }

  // Owner identity + the businesses RLS lets this user see. Both queries
  // run as the signed-in user's own session — no service-role key, no
  // manual owner_id filtering (Row Level Security already scopes both).
  const [{ data: profile }, { data: businesses }] = await Promise.all([
    supabase!.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase!.from('businesses').select('*').order('created_at', { ascending: true })
  ]);

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get('sidebar_state')?.value === 'true';

  const businessRows = (businesses ?? []) as BusinessRow[];
  const cookieBusinessId = cookieStore.get(ACTIVE_BUSINESS_COOKIE)?.value;
  const initialActiveBusinessId =
    (cookieBusinessId && businessRows.some((b) => b.id === cookieBusinessId)
      ? cookieBusinessId
      : businessRows[0]?.id) ?? null;

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
          profile={(profile as ProfileRow | null) ?? null}
          businesses={businessRows}
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
