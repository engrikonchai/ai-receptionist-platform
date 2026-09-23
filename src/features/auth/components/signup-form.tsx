'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icons } from '@/components/icons';
import { useAppForm } from '@/lib/form';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { isSupabaseConfigured, SUPABASE_MISSING_ENV_MESSAGE } from '@/lib/supabase/env';
import { getSiteUrl } from '@/lib/site-url';
import { signupSchema } from '../schemas/auth';
import { DaylightConfigNotice } from './daylight/daylight-config-notice';
import { DaylightFormMessage } from './daylight/daylight-form-message';
import { DaylightPasswordField } from './daylight/daylight-password-field';
import { DaylightSubmitButton } from './daylight/daylight-submit-button';
import { DaylightTextField } from './daylight/daylight-text-field';

export function SignupForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (formError) errorRef.current?.focus();
  }, [formError]);

  const form = useAppForm({
    defaultValues: { displayName: '', email: '', password: '', confirmPassword: '' },
    validators: { onSubmit: signupSchema },
    onSubmit: async ({ value }) => {
      setFormError(null);
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        setFormError(SUPABASE_MISSING_ENV_MESSAGE);
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: value.email,
        password: value.password,
        options: {
          data: { display_name: value.displayName },
          // Absolute URL Supabase embeds in the confirmation email — the
          // callback route exchanges its `code` for a session and lands
          // the new owner on /onboarding (a brand-new profile always has
          // onboarding_completed = false, so this saves the extra hop
          // dashboard/layout.tsx's own redirect would otherwise add).
          emailRedirectTo: `${getSiteUrl()}/auth/callback?next=${encodeURIComponent('/onboarding')}`
        }
      });

      if (error) {
        setFormError(error.message);
        return;
      }

      if (data.session && data.user) {
        // A session came back immediately (email confirmation is off for
        // this project). The onboarding trigger already created the
        // profile with a default display_name derived from the email —
        // personalize it with what the owner actually typed. This is a
        // normal authenticated write under the existing
        // "profiles_update_own" RLS policy, not a new migration.
        await supabase
          .from('profiles')
          .update({ display_name: value.displayName })
          .eq('id', data.user.id);
        // A brand-new profile always has onboarding_completed = false —
        // send them straight there rather than through the dashboard's
        // own redirect.
        router.push('/onboarding');
        router.refresh();
        return;
      }

      // No session yet — Supabase requires email confirmation before the
      // account can sign in. Never pretend this succeeded as a login.
      setConfirmationEmail(value.email);
    }
  });

  if (!isSupabaseConfigured()) {
    return <DaylightConfigNotice message={SUPABASE_MISSING_ENV_MESSAGE} />;
  }

  if (confirmationEmail) {
    return (
      <div className='flex flex-col gap-5'>
        <DaylightFormMessage variant='info'>
          <p className='text-daylight-ink font-semibold'>Check your email</p>
          <p className='mt-1'>
            We sent a confirmation link to{' '}
            <span className='text-daylight-ink font-semibold'>{confirmationEmail}</span>. Follow the
            link to activate your account, then sign in.
          </p>
        </DaylightFormMessage>
        <Link
          href='/login'
          aria-label='Back to sign in'
          className='border-daylight-border text-daylight-ink hover:bg-daylight-indigo-tint inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-daylight-button border-1.5 bg-white text-[15px] font-bold transition-colors'
        >
          <Icons.arrowLeft className='size-4' aria-hidden='true' />
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
          name='displayName'
          children={() => (
            <DaylightTextField
              label='Display name'
              autoComplete='name'
              placeholder='Jane Doe'
              required
            />
          )}
        />
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
            <DaylightPasswordField
              label='Password'
              autoComplete='new-password'
              description='At least 8 characters.'
              required
            />
          )}
        />
        <form.AppField
          name='confirmPassword'
          children={() => (
            <DaylightPasswordField label='Confirm password' autoComplete='new-password' required />
          )}
        />

        {formError && (
          <DaylightFormMessage ref={errorRef} variant='error'>
            {formError}
          </DaylightFormMessage>
        )}

        <form.AppForm>
          <DaylightSubmitButton>Create account</DaylightSubmitButton>
        </form.AppForm>
      </form>

      <p className='text-daylight-ink-soft text-center text-sm'>
        Already have an account?{' '}
        <Link href='/login' className='text-daylight-ink font-bold underline underline-offset-4'>
          Sign in
        </Link>
      </p>
    </div>
  );
}
