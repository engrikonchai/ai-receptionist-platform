import Link from 'next/link';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { RESET_LINK_INVALID_MESSAGE } from '../messages';

/**
 * Shown both when /reset-password is reached without a valid recovery
 * session (page-level check) and when that session turns out to have
 * expired partway through the form (updateUser() fails with a
 * session/JWT error) — same message, same recovery action either way.
 */
export function ResetPasswordInvalidLink() {
  return (
    <div className='space-y-4 text-sm'>
      <div role='alert' className='flex items-start gap-2.5'>
        <Icons.warning className='text-destructive mt-0.5 size-4 shrink-0' aria-hidden='true' />
        <p className='text-muted-foreground'>{RESET_LINK_INVALID_MESSAGE}</p>
      </div>
      <Button
        className='w-full'
        render={<Link href='/forgot-password' aria-label='Request a new password reset link' />}
      >
        Request a new reset link
      </Button>
    </div>
  );
}
