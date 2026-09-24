import React from 'react';
import { SidebarTrigger } from '../ui/sidebar';
import { Breadcrumbs } from '../breadcrumbs';
import SearchInput, { SearchIconButton } from '../search-input';
import { ThemeModeToggle } from '../themes/theme-mode-toggle';

// Slim top bar. The page's own title lives in the page (PageContainer /
// the Inbox list), so on desktop the bar only carries navigation chrome
// (sidebar toggle, search, theme). On narrow screens the current page
// name stays here, because the mobile tab bar has no title of its own.
export default function Header() {
  return (
    <header className='bg-background/90 border-border sticky top-0 z-20 flex min-h-14 shrink-0 items-center justify-between gap-3 border-b pt-[env(safe-area-inset-top)] backdrop-blur-md'>
      <div className='flex min-w-0 flex-1 items-center gap-2 px-4 sm:px-6'>
        <SidebarTrigger className='-ml-1 hidden md:inline-flex' />
        <div className='min-w-0 md:hidden'>
          <Breadcrumbs />
        </div>
        <div className='hidden lg:flex lg:w-full lg:max-w-sm'>
          <SearchInput />
        </div>
      </div>

      <div className='flex shrink-0 items-center gap-2 px-4 sm:px-6'>
        <SearchIconButton />
        <ThemeModeToggle />
      </div>
    </header>
  );
}
