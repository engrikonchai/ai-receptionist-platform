'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icons } from '@/components/icons';
import { FieldGroup } from '@/components/ui/field';
import { useAppForm } from '@/lib/form';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { isSupabaseConfigured, SUPABASE_MISSING_ENV_MESSAGE } from '@/lib/supabase/env';
import { loginSchema } from '../schemas/auth';
import { SupabaseConfigNotice } from './supabase-config-notice';

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
    return <SupabaseConfigNotice message={SUPABASE_MISSING_ENV_MESSAGE} />;
  }

  return (
    <div className='space-y-4'>
      {successMessage && (
        <div
          role='status'
          className='border-primary/30 bg-primary/10 flex items-start gap-2.5 rounded-lg border p-3 text-sm'
        >
          <Icons.circleCheck className='text-primary mt-0.5 size-4 shrink-0' aria-hidden='true' />
          <p className='text-foreground'>{successMessage}</p>
        </div>
      )}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
      >
        <FieldGroup>
          <form.AppField
            name='email'
            children={(field) => (
              <field.TextField
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
            children={(field) => (
              <field.TextField
                label='Password'
                type='password'
                autoComplete='current-password'
                required
              />
            )}
          />
          <div className='flex justify-end'>
            <Link
              href='/forgot-password'
              className='text-muted-foreground hover:text-foreground text-xs underline underline-offset-4'
            >
              Forgot password?
            </Link>
          </div>
          {formError && (
            <p role='alert' className='text-destructive text-sm'>
              {formError}
            </p>
          )}
          <form.AppForm>
            <form.SubmitButton className='w-full'>Sign in</form.SubmitButton>
          </form.AppForm>
        </FieldGroup>
      </form>

      <p className='text-muted-foreground text-center text-sm'>
        Don&apos;t have an account?{' '}
        <Link href='/signup' className='text-foreground font-medium underline underline-offset-4'>
          Sign up
        </Link>
      </p>
    </div>
  );
}
