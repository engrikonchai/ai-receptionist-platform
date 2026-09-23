import Link from 'next/link';
import { RESET_LINK_INVALID_MESSAGE } from '../../messages';
import { DaylightFormMessage } from './daylight-form-message';

/**
 * The Daylight-scoped counterpart to the shared `ResetPasswordInvalidLink`
 * — shown both when /reset-password is reached without a valid recovery
 * session and when that session expires partway through the form.
 */
export function DaylightInvalidLink() {
  return (
    <div className='flex flex-col gap-4'>
      <DaylightFormMessage variant='error'>{RESET_LINK_INVALID_MESSAGE}</DaylightFormMessage>
      <Link
        href='/forgot-password'
        aria-label='Request a new password reset link'
        className='bg-daylight-indigo shadow-daylight-button hover:bg-daylight-indigo-hover focus-visible:outline-daylight-focus inline-flex min-h-12 w-full items-center justify-center rounded-daylight-button text-[15px] font-bold text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2'
      >
        Request a new reset link
      </Link>
    </div>
  );
}
