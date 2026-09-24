'use client';

import { useState } from 'react';
import { Icons } from '@/components/icons';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';
import { LandingButton } from './landing-button';
import { LandingLogo } from './landing-logo';
import { NAV_LINKS } from './nav-links';

/**
 * Full-screen disclosure panel for narrow viewports — built on the shared
 * `Sheet` primitive (Base UI Dialog: real focus trap, Escape-to-close, a
 * portal). It closes itself on a link click so the anchor scroll runs
 * against the closed page rather than through an overlay.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  // Renders the Sheet's portal inside `.daylight-marketing`/`.landing`
  // (see (marketing)/layout.tsx) rather than `document.body`, which sits
  // outside that scope and would strip every token class from the panel.
  // `document` doesn't exist during SSR, hence the guard.
  const [portalContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.getElementById('daylight-marketing-root')
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label='Open menu'
        className='text-lp-ink hover:bg-lp-ink/5 inline-flex size-11 items-center justify-center rounded-full md:hidden'
      >
        <Icons.menu className='size-6' aria-hidden='true' />
      </SheetTrigger>
      <SheetContent
        side='right'
        showCloseButton={false}
        container={portalContainer}
        className='bg-lp-paper flex w-full flex-col gap-0 border-none p-5 sm:max-w-full'
      >
        <SheetTitle className='sr-only'>Menu</SheetTitle>
        <SheetDescription className='sr-only'>Site navigation and account actions</SheetDescription>

        <div className='flex items-center justify-between'>
          <LandingLogo />
          <SheetClose
            aria-label='Close menu'
            className='text-lp-ink hover:bg-lp-ink/5 inline-flex size-11 items-center justify-center rounded-full'
          >
            <Icons.close className='size-6' aria-hidden='true' />
          </SheetClose>
        </div>

        <nav aria-label='Main' className='mt-10 flex flex-col'>
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className='lp-display border-lp-line text-lp-ink flex items-center justify-between border-b py-5 text-[34px] leading-none font-semibold'
            >
              {link.label}
              <Icons.arrowRight className='text-lp-muted size-6' aria-hidden='true' />
            </a>
          ))}
        </nav>

        <div className='mt-auto flex flex-col gap-3 pt-8'>
          <LandingButton href='/signup' fullWidthOnMobile onClick={() => setOpen(false)}>
            Get started
          </LandingButton>
          <LandingButton
            href='/login'
            variant='secondary'
            fullWidthOnMobile
            onClick={() => setOpen(false)}
          >
            Sign in
          </LandingButton>
        </div>
      </SheetContent>
    </Sheet>
  );
}
