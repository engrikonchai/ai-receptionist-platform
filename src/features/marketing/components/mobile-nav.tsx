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
import { MarketingButton } from './marketing-button';
import { NAV_LINKS } from './nav-links';

/**
 * Full-screen dark disclosure panel for narrow viewports — built on the
 * shared `Sheet` primitive (Base UI Dialog under the hood: real focus
 * trap, Escape-to-close, and a portal) with every visual class replaced
 * by Daylight tokens instead of the dashboard's shadcn ones. Closes
 * itself on a link click so the browser's own anchor-scroll behavior
 * runs against the now-closed page, not through an overlay.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  // Renders the Sheet's portal inside `.daylight-marketing` (see
  // (marketing)/layout.tsx) rather than Base UI's default
  // `document.body` target, which sits outside that scope and would
  // silently strip every daylight-* class from the portaled panel.
  // `document` doesn't exist during SSR, hence the guard; on the
  // client it resolves synchronously since hydration attaches to
  // already-server-rendered DOM.
  const [portalContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.getElementById('daylight-marketing-root')
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label='Open menu'
        className='text-daylight-ink focus-visible:outline-daylight-focus inline-flex size-11 items-center justify-center rounded-daylight-control focus-visible:outline-2 focus-visible:outline-offset-2 md:hidden'
      >
        <Icons.menu className='size-6' aria-hidden='true' />
      </SheetTrigger>
      <SheetContent
        side='right'
        showCloseButton={false}
        container={portalContainer}
        className='bg-daylight-navy-deep flex w-full flex-col gap-0 border-none p-6 sm:max-w-full'
      >
        <SheetTitle className='sr-only'>Menu</SheetTitle>
        <SheetDescription className='sr-only'>Site navigation and account actions</SheetDescription>

        <div className='flex items-center justify-between'>
          <span className='inline-flex items-center gap-2'>
            <Icons.logo className='text-daylight-indigo size-6' aria-hidden='true' />
            <span className='text-lg font-extrabold text-white'>Platform</span>
          </span>
          <SheetClose
            aria-label='Close menu'
            className='focus-visible:outline-daylight-focus inline-flex size-11 items-center justify-center rounded-daylight-control text-white focus-visible:outline-2 focus-visible:outline-offset-2'
          >
            <Icons.close className='size-6' aria-hidden='true' />
          </SheetClose>
        </div>

        <nav aria-label='Main' className='mt-9 flex flex-col'>
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className='text-daylight-on-navy-body border-daylight-navy-panel focus-visible:outline-daylight-focus border-b py-4 text-3xl font-extrabold tracking-tight focus-visible:outline-2 focus-visible:-outline-offset-2'
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className='mt-auto flex flex-col gap-2.5 pt-8'>
          <MarketingButton href='/signup' fullWidthOnMobile onClick={() => setOpen(false)}>
            Get started
          </MarketingButton>
          <MarketingButton
            href='/login'
            variant='secondary-on-navy'
            fullWidthOnMobile
            onClick={() => setOpen(false)}
          >
            Sign in
          </MarketingButton>
        </div>
      </SheetContent>
    </Sheet>
  );
}
