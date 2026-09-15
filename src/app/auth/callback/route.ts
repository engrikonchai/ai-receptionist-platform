import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { resolveSafeNextPath } from '@/lib/safe-redirect';

const GENERIC_ERROR_MESSAGE =
  'That confirmation link is invalid or has expired. Please sign in, or sign up again to get a new link.';

function redirectToLoginWithError(origin: string, message: string) {
  const url = new URL('/login', origin);
  url.searchParams.set('error', message);
  return NextResponse.redirect(url);
}

/**
 * Exchanges the PKCE `code` Supabase puts in email links (confirmation,
 * password recovery, magic link) for a real session, storing it in
 * cookies through the existing cookie-based SSR server client, then
 * redirects onward. `next` is validated against `isSafeInternalPath` —
 * an attacker-controlled query string is never trusted as a redirect
 * target as-is.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = resolveSafeNextPath(searchParams.get('next'));

  if (!code) {
    return redirectToLoginWithError(
      origin,
      'Missing confirmation code. Please use the link from your email again, or sign up for a new one.'
    );
  }

  if (!isSupabaseConfigured()) {
    return redirectToLoginWithError(origin, 'Supabase is not configured for this environment yet.');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase!.auth.exchangeCodeForSession(code);

  if (error) {
    return redirectToLoginWithError(origin, GENERIC_ERROR_MESSAGE);
  }

  return NextResponse.redirect(new URL(next, origin));
}
