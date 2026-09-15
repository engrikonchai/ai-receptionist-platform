import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getPublicSupabaseEnv } from '@/lib/supabase/env';

/**
 * Runs on every request to an auth-relevant route. Two jobs:
 *
 * 1. Refresh the Supabase session cookies (so a session doesn't silently
 *    expire mid-visit) by calling `auth.getUser()`.
 * 2. An *optimistic* redirect: bounce a signed-out visitor away from
 *    `/dashboard/*` and `/onboarding` to `/login`.
 *
 * Deliberately does NOT bounce a signed-in visitor away from
 * `/login`/`/signup` here — where they belong depends on
 * `profiles.onboarding_completed`, which would mean an extra table
 * query on every request just for this fast path. That decision is
 * made once, correctly, by the Server Component on each of those pages
 * (login/page.tsx, signup/page.tsx, onboarding/page.tsx,
 * dashboard/layout.tsx) — which is the real security boundary anyway.
 * Per Next.js's own guidance, Proxy should never be relied on as the
 * sole authorization mechanism.
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

  const { pathname } = request.nextUrl;
  const isProtectedRoute =
    pathname === '/dashboard' || pathname.startsWith('/dashboard/') || pathname === '/onboarding';

  if (!user && isProtectedRoute) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ['/dashboard', '/dashboard/:path*', '/onboarding', '/login', '/signup']
};
