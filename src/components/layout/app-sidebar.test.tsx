// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SidebarProvider } from '@/components/ui/sidebar';
import type { BusinessRow, ProfileRow } from '@/lib/supabase/database.types';
import AppSidebar from './app-sidebar';

/**
 * Regression coverage for the mobile sidebar navigation bug: tapping a
 * nav item (e.g. "Widget") navigates the underlying page correctly, but
 * dashboard/layout.tsx's SidebarProvider is shared across every
 * /dashboard/* route (Next's App Router never remounts a shared layout
 * on a same-layout navigation), so without an explicit close, the
 * mobile Sheet stayed open and visually covered the page the tap had
 * already navigated to — looking exactly like "the link does nothing."
 * See app-sidebar.tsx's closeMobileSidebar for the fix.
 */

const mockUsePathname = vi.fn<() => string>().mockReturnValue('/dashboard/overview');

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn() })
}));

// jsdom has no matchMedia — SidebarProvider's own internal useIsMobile()
// call (unrelated to the mocked useSidebar() below, which only affects
// app-sidebar.tsx's own import) needs this to not throw.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  }));
}

const setOpenMobile = vi.fn();
const mockUseSidebar = vi.fn();

vi.mock('@/components/ui/sidebar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/sidebar')>();
  return { ...actual, useSidebar: () => mockUseSidebar() };
});

vi.mock('./business-switcher', () => ({
  BusinessSwitcher: () => <div data-testid='business-switcher-stub' />
}));

vi.mock('./owner-menu', () => ({
  OwnerMenu: () => <div data-testid='owner-menu-stub' />
}));

// Nav badge counts have their own dedicated coverage in
// use-nav-badge-counts.test.ts — stubbed here to zero so this file's
// tests (link hrefs, mobile auto-close) don't also need to mock
// conversationsOptions/leadsListOptions data just to render.
const mockUseNavBadgeCounts = vi.fn();
vi.mock('@/hooks/use-nav-badge-counts', () => ({
  useNavBadgeCounts: () => mockUseNavBadgeCounts()
}));

const noBusinesses: BusinessRow[] = [];
const noProfile: ProfileRow | null = null;

function renderSidebar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <AppSidebar
          ownerEmail='owner@example.com'
          profile={noProfile}
          businesses={noBusinesses}
          initialActiveBusinessId={null}
        />
      </SidebarProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  setOpenMobile.mockReset();
  mockUseNavBadgeCounts.mockReset().mockReturnValue({ pendingHandoffCount: 0, newLeadCount: 0 });
  mockUsePathname.mockReset().mockReturnValue('/dashboard/overview');
});

describe('AppSidebar — Widget nav item', () => {
  it('renders as a real anchor pointing at /dashboard/widget, never disabled', () => {
    mockUseSidebar.mockReturnValue({ isMobile: false, setOpenMobile });
    renderSidebar();

    const link = screen.getByRole('link', { name: 'Widget' });
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/dashboard/widget');
    expect(link).not.toHaveAttribute('disabled');
    expect(link).not.toHaveAttribute('aria-disabled');
  });

  it('every top-level Main-group nav item is a real, non-disabled anchor with a matching href', () => {
    mockUseSidebar.mockReturnValue({ isMobile: false, setOpenMobile });
    renderSidebar();

    const expected: Record<string, string> = {
      Overview: '/dashboard/overview',
      Inbox: '/dashboard/inbox',
      Leads: '/dashboard/leads',
      Knowledge: '/dashboard/knowledge',
      Channels: '/dashboard/channels',
      Widget: '/dashboard/widget'
    };

    for (const [name, href] of Object.entries(expected)) {
      const link = screen.getByRole('link', { name });
      expect(link.tagName).toBe('A');
      expect(link).toHaveAttribute('href', href);
      expect(link).not.toHaveAttribute('disabled');
      expect(link).not.toHaveAttribute('aria-disabled');
    }
  });
});

describe('AppSidebar — mobile sidebar auto-close', () => {
  it('closes the mobile sidebar sheet when the Widget link is clicked on mobile', () => {
    mockUseSidebar.mockReturnValue({ isMobile: true, setOpenMobile });
    renderSidebar();

    fireEvent.click(screen.getByRole('link', { name: 'Widget' }));

    expect(setOpenMobile).toHaveBeenCalledTimes(1);
    expect(setOpenMobile).toHaveBeenCalledWith(false);
  });

  it('closes the mobile sidebar sheet when any other top-level link is clicked on mobile', () => {
    mockUseSidebar.mockReturnValue({ isMobile: true, setOpenMobile });
    renderSidebar();

    fireEvent.click(screen.getByRole('link', { name: 'Inbox' }));

    expect(setOpenMobile).toHaveBeenCalledWith(false);
  });

  it('never calls setOpenMobile on desktop — nothing there is a modal overlay to close', () => {
    mockUseSidebar.mockReturnValue({ isMobile: false, setOpenMobile });
    renderSidebar();

    fireEvent.click(screen.getByRole('link', { name: 'Widget' }));

    expect(setOpenMobile).not.toHaveBeenCalled();
  });
});

describe('AppSidebar — product brand mark', () => {
  it('links back to Overview and never claims the current page is "Overview"', () => {
    mockUseSidebar.mockReturnValue({ isMobile: false, setOpenMobile });
    renderSidebar();

    const brand = screen.getByRole('link', { name: 'Platform — go to Overview' });
    expect(brand).toHaveAttribute('href', '/dashboard/overview');
  });
});

describe('AppSidebar — active navigation state', () => {
  it('marks the current route\'s nav item with aria-current="page", and no other item', () => {
    mockUseSidebar.mockReturnValue({ isMobile: false, setOpenMobile });
    mockUsePathname.mockReturnValue('/dashboard/leads');
    renderSidebar();

    expect(screen.getByRole('link', { name: 'Leads' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Widget' })).not.toHaveAttribute('aria-current');
  });

  it('keeps the parent item active while on a path nested beneath its URL', () => {
    mockUseSidebar.mockReturnValue({ isMobile: false, setOpenMobile });
    // No real route is nested today, but the active-match logic must
    // already handle one correctly — see isNavItemActive's own doc
    // comment in app-sidebar.tsx.
    mockUsePathname.mockReturnValue('/dashboard/leads/123');
    renderSidebar();

    expect(screen.getByRole('link', { name: 'Leads' })).toHaveAttribute('aria-current', 'page');
  });

  it('never marks a nav item active for an unrelated route that merely shares a text prefix', () => {
    mockUseSidebar.mockReturnValue({ isMobile: false, setOpenMobile });
    mockUsePathname.mockReturnValue('/dashboard/leads-archive');
    renderSidebar();

    expect(screen.getByRole('link', { name: 'Leads' })).not.toHaveAttribute('aria-current');
  });
});

describe('AppSidebar — nav badge counts', () => {
  it('shows no badge on Inbox or Leads when there is nothing pending', () => {
    mockUseSidebar.mockReturnValue({ isMobile: false, setOpenMobile });
    mockUseNavBadgeCounts.mockReturnValue({ pendingHandoffCount: 0, newLeadCount: 0 });
    renderSidebar();

    expect(screen.queryByText('3')).not.toBeInTheDocument();
  });

  it('shows the pending handoff count as a badge on the Inbox nav item', () => {
    mockUseSidebar.mockReturnValue({ isMobile: false, setOpenMobile });
    mockUseNavBadgeCounts.mockReturnValue({ pendingHandoffCount: 3, newLeadCount: 0 });
    renderSidebar();

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByLabelText('3 pending handoffs')).toBeInTheDocument();
  });

  it('shows the new lead count as a badge on the Leads nav item', () => {
    mockUseSidebar.mockReturnValue({ isMobile: false, setOpenMobile });
    mockUseNavBadgeCounts.mockReturnValue({ pendingHandoffCount: 0, newLeadCount: 5 });
    renderSidebar();

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByLabelText('5 new leads')).toBeInTheDocument();
  });
});
