import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { resolveSafeNextPath } from '@/lib/safe-redirect';
import { RECOVERY_CALLBACK_ERROR_MESSAGE } from '@/features/auth/messages';

const GENERIC_ERROR_MESSAGE =
  'That confirmation link is invalid or has expired. Please sign in, or sign up again to get a new link.';
const MISSING_CODE_MESSAGE =
  'Missing confirmation code. Please use the link from your email again, or sign up for a new one.';

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
 *
 * A password-recovery link always carries `next=/reset-password`
 * (see forgot-password-form.tsx's `redirectTo`), so that's how a
 * failure here is told apart from a failed signup confirmation — the
 * error message shown on /login differs accordingly, but the mechanism
 * (redirect to /login with a friendly `?error=`) and the safe-redirect
 * handling are identical either way. Neither the raw `code` value nor
 * any detail of the underlying Supabase error is ever included in the
 * redirect or the message shown.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = resolveSafeNextPath(searchParams.get('next'));
  const isRecoveryAttempt = next === '/reset-password';

  if (!code) {
    return redirectToLoginWithError(
      origin,
      isRecoveryAttempt ? RECOVERY_CALLBACK_ERROR_MESSAGE : MISSING_CODE_MESSAGE
    );
  }

  if (!isSupabaseConfigured()) {
    return redirectToLoginWithError(origin, 'Supabase is not configured for this environment yet.');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase!.auth.exchangeCodeForSession(code);

  if (error) {
    return redirectToLoginWithError(
      origin,
      isRecoveryAttempt ? RECOVERY_CALLBACK_ERROR_MESSAGE : GENERIC_ERROR_MESSAGE
    );
  }

  return NextResponse.redirect(new URL(next, origin));
}
