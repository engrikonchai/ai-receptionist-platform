'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAppForm } from '@/lib/form';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { isSupabaseConfigured, SUPABASE_MISSING_ENV_MESSAGE } from '@/lib/supabase/env';
import { loginSchema } from '../schemas/auth';
import { DaylightConfigNotice } from './daylight/daylight-config-notice';
import { DaylightFormMessage } from './daylight/daylight-form-message';
import { DaylightPasswordField } from './daylight/daylight-password-field';
import { DaylightSubmitButton } from './daylight/daylight-submit-button';
import { DaylightTextField } from './daylight/daylight-text-field';

/** Generic on purpose — never reveals whether the email exists. */
const INCORRECT_CREDENTIALS_MESSAGE = 'Incorrect email or password.';

export function LoginForm({
  next,
  initialError,
  successMessage
}: {
  next: string;
  initialError?: string;
  /** e.g. after a successful password reset — rendered distinctly from `formError`, never as an alert. */
  successMessage?: string;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(initialError ?? null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (formError) errorRef.current?.focus();
  }, [formError]);

  const form = useAppForm({
    defaultValues: { email: '', password: '' },
    validators: { onSubmit: loginSchema },
    onSubmit: async ({ value }) => {
      setFormError(null);
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        setFormError(SUPABASE_MISSING_ENV_MESSAGE);
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: value.email,
        password: value.password
      });

      if (error) {
        setFormError(
          error.message === 'Invalid login credentials'
            ? INCORRECT_CREDENTIALS_MESSAGE
            : error.message
        );
        return;
      }

      router.push(next);
      router.refresh();
    }
  });

  if (!isSupabaseConfigured()) {
    return <DaylightConfigNotice message={SUPABASE_MISSING_ENV_MESSAGE} />;
  }

  return (
    <div className='flex flex-col gap-5'>
      {successMessage && (
        <DaylightFormMessage variant='success'>{successMessage}</DaylightFormMessage>
      )}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className='flex flex-col gap-5'
      >
        <form.AppField
          name='email'
          children={() => (
            <DaylightTextField
              label='Email'
              type='email'
              autoComplete='email'
              placeholder='you@example.com'
              required
            />
          )}
        />
        <form.AppField
          name='password'
          children={() => (
            <DaylightPasswordField label='Password' autoComplete='current-password' required />
          )}
        />
        <div className='flex justify-end'>
          <Link
            href='/forgot-password'
            className='text-daylight-ink-soft hover:text-daylight-ink text-xs font-semibold underline underline-offset-4'
          >
            Forgot password?
          </Link>
        </div>

        {formError && (
          <DaylightFormMessage ref={errorRef} variant='error'>
            {formError}
          </DaylightFormMessage>
        )}

        <form.AppForm>
          <DaylightSubmitButton>Sign in</DaylightSubmitButton>
        </form.AppForm>
      </form>

      <p className='text-daylight-ink-soft text-center text-sm'>
        Don&apos;t have an account?{' '}
        <Link href='/signup' className='text-daylight-ink font-bold underline underline-offset-4'>
          Sign up
        </Link>
      </p>
    </div>
  );
}
