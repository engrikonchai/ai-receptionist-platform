'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAppForm } from '@/lib/form';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { isSupabaseConfigured, SUPABASE_MISSING_ENV_MESSAGE } from '@/lib/supabase/env';
import { resetPasswordSchema } from '../schemas/auth';
import { DaylightConfigNotice } from './daylight/daylight-config-notice';
import { DaylightFormMessage } from './daylight/daylight-form-message';
import { DaylightInvalidLink } from './daylight/daylight-invalid-link';
import { DaylightPasswordField } from './daylight/daylight-password-field';
import { DaylightSubmitButton } from './daylight/daylight-submit-button';

const GENERIC_UPDATE_ERROR = 'We could not update your password. Please try again.';

/**
 * Maps a Supabase `updateUser` error to display text — never the raw
 * message unless it's already Supabase's own user-facing password-
 * policy copy (e.g. "Password should be at least 6 characters"), which
 * is safe to show verbatim. Everything else, including a stale/expired
 * recovery session, collapses to one of two fixed, friendly strings —
 * never a raw auth/database error, and never the password itself
 * (Supabase's error messages never echo submitted input).
 */
function classifyUpdateError(message: string): {
  kind: 'session_expired' | 'password_policy' | 'generic';
  text: string;
} {
  const lower = message.toLowerCase();
  if (lower.includes('session') || lower.includes('expired') || lower.includes('jwt')) {
    return { kind: 'session_expired', text: message };
  }
  if (lower.includes('password')) {
    return { kind: 'password_policy', text: message };
  }
  return { kind: 'generic', text: GENERIC_UPDATE_ERROR };
}

export function ResetPasswordForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [success, setSuccess] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (formError) errorRef.current?.focus();
  }, [formError]);

  const form = useAppForm({
    defaultValues: { password: '', confirmPassword: '' },
    validators: { onSubmit: resetPasswordSchema },
    onSubmit: async ({ value }) => {
      setFormError(null);
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        setFormError(SUPABASE_MISSING_ENV_MESSAGE);
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: value.password });

      if (error) {
        const classified = classifyUpdateError(error.message);
        if (classified.kind === 'session_expired') {
          setSessionExpired(true);
        } else {
          setFormError(classified.text);
        }
        return;
      }

      // 1. show success, 2. sign the recovery session out, 3. redirect.
      setSuccess(true);
      await supabase.auth.signOut();
      router.push('/login?passwordReset=success');
      router.refresh();
    }
  });

  if (!isSupabaseConfigured()) {
    return <DaylightConfigNotice message={SUPABASE_MISSING_ENV_MESSAGE} />;
  }

  if (sessionExpired) {
    return <DaylightInvalidLink />;
  }

  if (success) {
    return (
      <DaylightFormMessage variant='success'>
        Password updated. Redirecting you to sign in…
      </DaylightFormMessage>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className='flex flex-col gap-5'
    >
      <form.AppField
        name='password'
        children={() => (
          <DaylightPasswordField
            label='New password'
            autoComplete='new-password'
            description='At least 8 characters.'
            required
          />
        )}
      />
      <form.AppField
        name='confirmPassword'
        children={() => (
          <DaylightPasswordField
            label='Confirm new password'
            autoComplete='new-password'
            required
          />
        )}
      />

      {formError && (
        <DaylightFormMessage ref={errorRef} variant='error'>
          {formError}
        </DaylightFormMessage>
      )}

      <form.AppForm>
        <DaylightSubmitButton>Update password</DaylightSubmitButton>
      </form.AppForm>
    </form>
  );
}
