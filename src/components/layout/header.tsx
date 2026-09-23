import React from 'react';
import { SidebarTrigger } from '../ui/sidebar';
import { Separator } from '../ui/separator';
import { Breadcrumbs } from '../breadcrumbs';
import SearchInput from '../search-input';
import { ThemeModeToggle } from '../themes/theme-mode-toggle';

// Shell anatomy: "Top bar — 68px, white, sticky. Page title left, search
// centre-left, actions right." A solid `--card` surface with a 1px
// bottom border, not the translucent/backdrop-blurred floating bar this
// component started from — that gave the shell a generic-template feel
// rather than the approved system's defined, solid top bar.
export default function Header() {
  return (
    <header className='bg-card border-border sticky top-0 z-20 flex h-[68px] shrink-0 items-center justify-between gap-3 border-b pt-[env(safe-area-inset-top)]'>
      <div className='flex min-w-0 flex-1 items-center gap-3 px-4 sm:px-7'>
        <SidebarTrigger className='-ml-1' />
        <Separator orientation='vertical' className='mr-1 h-5 data-vertical:self-center' />
        <Breadcrumbs />
      </div>

      <div className='flex shrink-0 items-center gap-3 px-4 sm:px-7'>
        <div className='hidden md:flex'>
          <SearchInput />
        </div>
        <ThemeModeToggle />
      </div>
    </header>
  );
}
