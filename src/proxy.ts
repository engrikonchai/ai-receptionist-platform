import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getPublicSupabaseEnv } from '@/lib/supabase/env';
import { DEFAULT_REDIRECT_PATH, resolveSafeNextPath } from '@/lib/safe-redirect';

/**
 * Runs on every request to an auth-relevant route. Two jobs:
 *
 * 1. Refresh the Supabase session cookies (so a session doesn't silently
 *    expire mid-visit) by calling `auth.getUser()`.
 * 2. An *optimistic* redirect: bounce a signed-out visitor away from
 *    `/dashboard/*` to `/login`, and a signed-in owner away from
 *    `/login`/`/signup` to the dashboard.
 *
 * This is a fast-path convenience only — it is not the real security
 * boundary. The actual enforcement is `app/dashboard/layout.tsx` (a
 * Server Component that re-checks the session) and Row Level Security
 * on every table. Per Next.js's own guidance, Proxy should never be
 * relied on as the sole authorization mechanism.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const env = getPublicSupabaseEnv();
  if (!env) {
    // Supabase isn't configured — let the request through; the
    // dashboard layout shows a clear developer-only setup notice.
    return response;
  }

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { pathname, searchParams } = request.nextUrl;
  const isDashboardRoute = pathname === '/dashboard' || pathname.startsWith('/dashboard/');
  const isAuthPage = pathname === '/login' || pathname === '/signup';

  if (!user && isDashboardRoute) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && isAuthPage) {
    const target = resolveSafeNextPath(searchParams.get('next'), DEFAULT_REDIRECT_PATH);
    return NextResponse.redirect(new URL(target, request.url));
  }

  return response;
}

export const config = {
  matcher: ['/dashboard', '/dashboard/:path*', '/login', '/signup']
};
