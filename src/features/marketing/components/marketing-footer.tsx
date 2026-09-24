import Link from 'next/link';
import { LandingLogo } from './landing-logo';

const FOOTER_LINKS = [
  { href: '/demo', label: 'Try the demo' },
  { href: '/signup', label: 'Get started' },
  { href: '/login', label: 'Sign in' }
] as const;

export function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className='bg-lp-paper-deep px-5 py-12 sm:px-8 sm:py-14'>
      <div className='mx-auto flex max-w-6xl flex-col gap-8 sm:flex-row sm:items-start sm:justify-between'>
        <div className='max-w-xs'>
          <LandingLogo />
          <p className='text-lp-ink-soft mt-4 text-sm leading-relaxed'>
            An AI assistant that answers your customers on your website, saves their details, and
            brings you in when it matters.
          </p>
        </div>
        <nav aria-label='Footer' className='flex flex-col gap-2 sm:items-end'>
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className='text-lp-ink hover:text-lp-ink-soft text-[15px] font-semibold underline-offset-4 hover:underline'
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className='border-lp-line text-lp-muted mx-auto mt-10 max-w-6xl border-t pt-5 text-sm'>
        © {year} Platform
      </div>
    </footer>
  );
}
