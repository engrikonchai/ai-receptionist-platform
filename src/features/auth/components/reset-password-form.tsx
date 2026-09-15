'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FieldGroup } from '@/components/ui/field';
import { Icons } from '@/components/icons';
import { useAppForm } from '@/lib/form';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { isSupabaseConfigured, SUPABASE_MISSING_ENV_MESSAGE } from '@/lib/supabase/env';
import { resetPasswordSchema } from '../schemas/auth';
import { SupabaseConfigNotice } from './supabase-config-notice';
import { ResetPasswordInvalidLink } from './reset-password-invalid-link';

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
    return <SupabaseConfigNotice message={SUPABASE_MISSING_ENV_MESSAGE} />;
  }

  if (sessionExpired) {
    return <ResetPasswordInvalidLink />;
  }

  if (success) {
    return (
      <div role='status' className='flex items-start gap-2.5 text-sm'>
        <Icons.circleCheck className='text-primary mt-0.5 size-4 shrink-0' aria-hidden='true' />
        <p className='text-foreground'>Password updated. Redirecting you to sign in…</p>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.AppField
          name='password'
          children={(field) => (
            <field.PasswordField
              label='New password'
              autoComplete='new-password'
              description='At least 8 characters.'
              required
            />
          )}
        />
        <form.AppField
          name='confirmPassword'
          children={(field) => (
            <field.PasswordField
              label='Confirm new password'
              autoComplete='new-password'
              required
            />
          )}
        />
        {formError && (
          <p role='alert' className='text-destructive text-sm'>
            {formError}
          </p>
        )}
        <form.AppForm>
          <form.SubmitButton className='w-full'>Update password</form.SubmitButton>
        </form.AppForm>
      </FieldGroup>
    </form>
  );
}
