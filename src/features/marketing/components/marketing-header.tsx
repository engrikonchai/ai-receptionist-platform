import Link from 'next/link';
import { Icons } from '@/components/icons';
import { MarketingButton } from './marketing-button';
import { MobileNav } from './mobile-nav';
import { HeaderScrollState } from './header-scroll-state';
import { NAV_LINKS } from './nav-links';

/**
 * Server Component shell — only the mobile disclosure panel
 * (`MobileNav`) needs client-side state. Every link is either a real
 * route (`/login`, `/signup`) or a real section id on this page; there
 * is no decorative/dead link here.
 */
export function MarketingHeader() {
  return (
    <header
      id='marketing-header'
      className='border-daylight-border/70 data-[scrolled=true]:border-daylight-border data-[scrolled=true]:shadow-daylight-sm sticky top-0 z-40 border-b bg-white/80 backdrop-blur-md transition-[border-color,box-shadow] duration-200 ease-out'
    >
      <HeaderScrollState />
      <div className='mx-auto flex max-w-7xl items-center gap-8 px-5 py-4 sm:px-8 lg:px-12'>
        <Link
          href='/'
          className='focus-visible:outline-daylight-focus inline-flex items-center gap-2 rounded-daylight-control focus-visible:outline-2 focus-visible:outline-offset-4'
        >
          <Icons.logo className='text-daylight-indigo size-6' aria-hidden='true' />
          <span className='text-daylight-ink text-lg font-extrabold tracking-tight'>Platform</span>
        </Link>

        <nav aria-label='Main' className='hidden items-center gap-7 md:flex'>
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className='text-daylight-ink-soft hover:text-daylight-ink focus-visible:outline-daylight-focus rounded-daylight-control transition-colors duration-150 ease-out text-[15px] font-medium focus-visible:outline-2 focus-visible:outline-offset-4'
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className='ml-auto hidden items-center gap-5 md:flex'>
          <Link
            href='/login'
            className='text-daylight-ink-soft hover:text-daylight-ink focus-visible:outline-daylight-focus rounded-daylight-control transition-colors duration-150 ease-out text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-4'
          >
            Sign in
          </Link>
          <MarketingButton href='/signup' className='min-h-0 px-5.5 py-3.25 text-sm'>
            Get started
          </MarketingButton>
        </div>

        <div className='ml-auto md:hidden'>
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
