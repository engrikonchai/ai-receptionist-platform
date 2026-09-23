import Link from 'next/link';
import { Icons } from '@/components/icons';
import { MarketingButton } from '@/features/marketing/components/marketing-button';

/**
 * A minimal Daylight-scoped header for /demo — distinct from
 * MarketingHeader because this route has no on-page sections to
 * anchor-link to. Always gives a clear, explicit way back to the
 * landing page, plus the real sign-in/sign-up destinations.
 */
export function DemoHeader() {
  return (
    <header className='border-daylight-border/70 sticky top-0 z-40 border-b bg-white/80 backdrop-blur-md'>
      <div className='mx-auto flex max-w-5xl items-center gap-3 px-4 py-4 sm:gap-4 sm:px-8'>
        <Link
          href='/'
          className='text-daylight-ink-soft hover:text-daylight-ink focus-visible:outline-daylight-focus inline-flex shrink-0 items-center gap-1.5 rounded-daylight-control text-sm font-bold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-4'
        >
          <Icons.arrowLeft className='size-4 shrink-0' aria-hidden='true' />
          <span className='sm:hidden'>Back</span>
          <span className='hidden sm:inline'>Back to Platform</span>
        </Link>

        <span className='bg-daylight-indigo-tint text-daylight-indigo ml-2 hidden shrink-0 rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap sm:inline-flex'>
          Interactive demo
        </span>

        <div className='ml-auto flex shrink-0 items-center gap-3 sm:gap-4'>
          <Link
            href='/login'
            className='text-daylight-ink-soft hover:text-daylight-ink focus-visible:outline-daylight-focus shrink-0 rounded-daylight-control text-[15px] font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-4'
          >
            Sign in
          </Link>
          <MarketingButton
            href='/signup'
            className='min-h-0 shrink-0 px-4.5 py-3 text-sm whitespace-nowrap sm:px-5.5 sm:py-3.25'
          >
            Get started
          </MarketingButton>
        </div>
      </div>
    </header>
  );
}
