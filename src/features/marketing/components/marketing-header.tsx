import Link from 'next/link';
import { LandingButton } from './landing-button';
import { LandingLogo } from './landing-logo';
import { MobileNav } from './mobile-nav';
import { NAV_LINKS } from './nav-links';

/**
 * Server Component shell — only the mobile disclosure panel
 * (`MobileNav`) needs client-side state. Every link is either a real
 * route (`/login`, `/signup`) or a real section id on this page.
 */
export function MarketingHeader() {
  return (
    <header className='border-lp-line/70 bg-lp-paper/85 sticky top-0 z-40 border-b backdrop-blur-md'>
      <div className='mx-auto flex max-w-6xl items-center gap-8 px-5 py-3 sm:px-8'>
        <Link href='/' aria-label='Platform home' className='rounded-full'>
          <LandingLogo />
        </Link>

        <nav aria-label='Main' className='hidden items-center gap-1 md:flex'>
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className='text-lp-ink-soft hover:bg-lp-ink/5 hover:text-lp-ink rounded-full px-4 py-2 text-[15px] font-semibold transition-colors'
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className='ml-auto hidden items-center gap-3 md:flex'>
          <Link
            href='/login'
            className='text-lp-ink hover:bg-lp-ink/5 rounded-full px-4 py-2 text-[15px] font-semibold transition-colors'
          >
            Sign in
          </Link>
          <LandingButton href='/signup' size='sm'>
            Get started
          </LandingButton>
        </div>

        <div className='ml-auto md:hidden'>
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
