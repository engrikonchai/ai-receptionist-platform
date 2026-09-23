import Link from 'next/link';
import { Icons } from '@/components/icons';
import { ThemeModeToggle } from '@/components/themes/theme-mode-toggle';
import { DaylightAuthVisual } from './daylight-auth-visual';

/**
 * The Daylight-scoped shell for login/signup/forgot-password/
 * reset-password — never the shared `AuthShell`
 * (src/features/auth/components/auth-shell.tsx), which stays exactly
 * as it is because `AccountRecovery` renders it directly inside
 * `dashboard/layout.tsx`; changing `AuthShell` would restyle that
 * dashboard fallback too. See docs/daylight-design-system.md
 * "Authentication" section for the full scoping rationale.
 *
 * Desktop: two-column split — a readable-width form column and an
 * expressive supporting visual. Mobile: the visual is hidden entirely
 * (`DaylightAuthVisual` is itself `hidden lg:flex`) so the form is the
 * very first thing a phone visitor sees, no scrolling required.
 */
export function DaylightAuthShell({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className='daylight-marketing flex min-h-svh flex-col'>
      <header className='border-daylight-border/70 border-b bg-white'>
        <div className='mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8'>
          <Link
            href='/'
            className='text-daylight-ink-soft hover:text-daylight-ink focus-visible:outline-daylight-focus inline-flex items-center gap-1.5 rounded-daylight-control text-sm font-bold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-4'
          >
            <Icons.arrowLeft className='size-4' aria-hidden='true' />
            Back to Platform
          </Link>
          <ThemeModeToggle />
        </div>
      </header>

      <main className='flex flex-1 lg:grid lg:grid-cols-2'>
        <div className='flex flex-1 items-start justify-center px-5 py-10 sm:px-8 sm:py-14 lg:items-center lg:py-20'>
          <div className='w-full max-w-md'>
            <h1 className='text-daylight-ink text-[26px] font-extrabold tracking-[-0.03em] sm:text-[28px]'>
              {title}
            </h1>
            <p className='text-daylight-ink-soft mt-2 text-[15px] leading-relaxed'>{description}</p>
            <div className='mt-7'>{children}</div>
          </div>
        </div>
        <DaylightAuthVisual />
      </main>
    </div>
  );
}
