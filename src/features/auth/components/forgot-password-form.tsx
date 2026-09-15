'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FieldGroup } from '@/components/ui/field';
import { Icons } from '@/components/icons';
import { useAppForm } from '@/lib/form';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { isSupabaseConfigured, SUPABASE_MISSING_ENV_MESSAGE } from '@/lib/supabase/env';
import { getSiteUrl } from '@/lib/site-url';
import { PASSWORD_RESET_EMAIL_SENT_MESSAGE } from '../messages';
import { forgotPasswordSchema } from '../schemas/auth';
import { SupabaseConfigNotice } from './supabase-config-notice';

export function ForgotPasswordForm() {
  const [submitted, setSubmitted] = useState(false);

  const form = useAppForm({
    defaultValues: { email: '' },
    validators: { onSubmit: forgotPasswordSchema },
    onSubmit: async ({ value }) => {
      const supabase = createSupabaseBrowserClient();
      if (supabase) {
        try {
          // Supabase itself never reveals whether an account exists for
          // this call — it resolves the same way either way. Any error
          // here (rate limiting, a transient network problem) is
          // deliberately swallowed too: showing a different outcome for
          // "no account" vs "request failed" would itself leak which
          // one happened, so this path always ends the same way.
          await supabase.auth.resetPasswordForEmail(value.email, {
            redirectTo: `${getSiteUrl()}/auth/callback?next=${encodeURIComponent('/reset-password')}`
          });
        } catch {
          // Swallowed for the same reason as an `error` result above.
        }
      }
      setSubmitted(true);
    }
  });

  if (!isSupabaseConfigured()) {
    return <SupabaseConfigNotice message={SUPABASE_MISSING_ENV_MESSAGE} />;
  }

  if (submitted) {
    return (
      <div className='space-y-4'>
        <div role='status' className='flex items-start gap-2.5 text-sm'>
          <Icons.info className='text-primary mt-0.5 size-4 shrink-0' aria-hidden='true' />
          <p className='text-foreground'>{PASSWORD_RESET_EMAIL_SENT_MESSAGE}</p>
        </div>
        <Link
          href='/login'
          className='text-foreground block text-center text-sm font-medium underline underline-offset-4'
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
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
          <form.AppForm>
            <form.SubmitButton className='w-full'>Send reset link</form.SubmitButton>
          </form.AppForm>
        </FieldGroup>
      </form>

      <p className='text-muted-foreground text-center text-sm'>
        Remembered your password?{' '}
        <Link href='/login' className='text-foreground font-medium underline underline-offset-4'>
          Sign in
        </Link>
      </p>
    </div>
  );
}
