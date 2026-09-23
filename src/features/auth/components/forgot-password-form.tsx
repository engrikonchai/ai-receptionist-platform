'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAppForm } from '@/lib/form';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { isSupabaseConfigured, SUPABASE_MISSING_ENV_MESSAGE } from '@/lib/supabase/env';
import { getSiteUrl } from '@/lib/site-url';
import { PASSWORD_RESET_EMAIL_SENT_MESSAGE } from '../messages';
import { forgotPasswordSchema } from '../schemas/auth';
import { DaylightConfigNotice } from './daylight/daylight-config-notice';
import { DaylightFormMessage } from './daylight/daylight-form-message';
import { DaylightSubmitButton } from './daylight/daylight-submit-button';
import { DaylightTextField } from './daylight/daylight-text-field';

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
    return <DaylightConfigNotice message={SUPABASE_MISSING_ENV_MESSAGE} />;
  }

  if (submitted) {
    return (
      <div className='flex flex-col gap-5'>
        <DaylightFormMessage variant='info'>
          {PASSWORD_RESET_EMAIL_SENT_MESSAGE}
        </DaylightFormMessage>
        <Link
          href='/login'
          className='text-daylight-ink block text-center text-sm font-bold underline underline-offset-4'
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-5'>
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
        <form.AppForm>
          <DaylightSubmitButton>Send reset link</DaylightSubmitButton>
        </form.AppForm>
      </form>

      <p className='text-daylight-ink-soft text-center text-sm'>
        Remembered your password?{' '}
        <Link href='/login' className='text-daylight-ink font-bold underline underline-offset-4'>
          Sign in
        </Link>
      </p>
    </div>
  );
}
