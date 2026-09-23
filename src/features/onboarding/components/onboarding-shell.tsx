import Link from 'next/link';
import { Icons } from '@/components/icons';

/**
 * The Daylight-scoped chrome around the onboarding wizard — the
 * "calmer internal side" of the Daylight system bridging the
 * expressive public entry (landing/auth) into the dashboard's own
 * established visual language. Only this outer shell (canvas, header,
 * card surface) is restyled; `OnboardingFlow`'s internal step fields
 * keep the shared shadcn/zen-themed field components exactly as they
 * are, so the wizard's own logic, validation and mutations are
 * untouched — see docs/daylight-design-system.md "Onboarding" section.
 *
 * Not used anywhere else — safe to restyle directly, unlike
 * `AuthShell`/`AccountRecovery`, which are also rendered inside the
 * authenticated dashboard layout.
 *
 * Carries the same `daylight-auth-scope` marker as `DaylightAuthShell`
 * so it picks up the same restrained auth-only dark theme (see
 * daylight.css and docs/daylight-design-system.md) when the visitor has
 * dark mode on — never the landing page or /demo, which don't carry
 * this marker.
 */
export function OnboardingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className='daylight-marketing daylight-auth-scope flex min-h-svh flex-col'>
      <header className='border-daylight-border/70 bg-daylight-surface border-b'>
        <div className='mx-auto flex max-w-3xl items-center px-5 py-4 sm:px-8'>
          <Link
            href='/'
            className='text-daylight-ink-soft hover:text-daylight-ink focus-visible:outline-daylight-focus inline-flex items-center gap-2 rounded-daylight-control text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-4'
          >
            <Icons.logo className='text-daylight-indigo size-5' aria-hidden='true' />
            Platform
          </Link>
        </div>
      </header>

      <main className='flex flex-1 items-start justify-center px-5 py-8 sm:items-center sm:px-8 sm:py-14'>
        <div className='rounded-daylight-card shadow-daylight-sm bg-daylight-surface w-full max-w-xl p-6 sm:p-9'>
          {children}
        </div>
      </main>
    </div>
  );
}
