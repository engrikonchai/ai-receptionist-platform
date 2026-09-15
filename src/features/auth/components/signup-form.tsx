'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Icons } from '@/components/icons';
import { useAppForm } from '@/lib/form';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { isSupabaseConfigured, SUPABASE_MISSING_ENV_MESSAGE } from '@/lib/supabase/env';
import { getSiteUrl } from '@/lib/site-url';
import { DEFAULT_REDIRECT_PATH } from '@/lib/safe-redirect';
import { signupSchema } from '../schemas/auth';
import { SupabaseConfigNotice } from './supabase-config-notice';

export function SignupForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);

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
          // callback route below exchanges its `code` for a session and
          // lands the owner on the dashboard.
          emailRedirectTo: `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(DEFAULT_REDIRECT_PATH)}`
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
        router.push('/dashboard/overview');
        router.refresh();
        return;
      }

      // No session yet — Supabase requires email confirmation before the
      // account can sign in. Never pretend this succeeded as a login.
      setConfirmationEmail(value.email);
    }
  });

  if (!isSupabaseConfigured()) {
    return <SupabaseConfigNotice message={SUPABASE_MISSING_ENV_MESSAGE} />;
  }

  if (confirmationEmail) {
    return (
      <div className='space-y-4'>
        <div className='flex items-start gap-2.5 text-sm'>
          <Icons.info className='text-primary mt-0.5 size-4 shrink-0' aria-hidden='true' />
          <div>
            <p className='text-foreground font-medium'>Check your email</p>
            <p className='text-muted-foreground mt-1'>
              We sent a confirmation link to{' '}
              <span className='text-foreground font-medium'>{confirmationEmail}</span>. Follow the
              link to activate your account, then sign in.
            </p>
          </div>
        </div>
        <Button
          variant='outline'
          className='w-full'
          render={<Link href='/login' aria-label='Back to sign in' />}
        >
          Back to sign in
        </Button>
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
            name='displayName'
            children={(field) => (
              <field.TextField
                label='Display name'
                autoComplete='name'
                placeholder='Jane Doe'
                required
              />
            )}
          />
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
                autoComplete='new-password'
                description='At least 8 characters.'
                required
              />
            )}
          />
          <form.AppField
            name='confirmPassword'
            children={(field) => (
              <field.TextField
                label='Confirm password'
                type='password'
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
            <form.SubmitButton className='w-full'>Create account</form.SubmitButton>
          </form.AppForm>
        </FieldGroup>
      </form>

      <p className='text-muted-foreground text-center text-sm'>
        Already have an account?{' '}
        <Link href='/login' className='text-foreground font-medium underline underline-offset-4'>
          Sign in
        </Link>
      </p>
    </div>
  );
}
