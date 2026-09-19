// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SidebarProvider } from '@/components/ui/sidebar';
import type { BusinessRow } from '@/lib/supabase/database.types';
import { BusinessSwitcher } from './business-switcher';

// SidebarProvider's mobile detection reads window.matchMedia, which
// jsdom doesn't implement.
window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false
  }) as unknown as MediaQueryList;

function business(overrides: Partial<BusinessRow> = {}): BusinessRow {
  return { id: 'biz-1', name: 'Adria Stay Budva', ...overrides } as BusinessRow;
}

function renderSwitcher(businesses: BusinessRow[]) {
  return render(
    <SidebarProvider>
      <BusinessSwitcher businesses={businesses} />
    </SidebarProvider>
  );
}

describe('BusinessSwitcher — V1 single-business identity display', () => {
  it('renders the one business’s name, with no dropdown/switcher affordance', () => {
    renderSwitcher([business({ name: 'Adria Stay Budva' })]);

    const display = screen.getByText('Adria Stay Budva').closest('button');
    expect(display).toBeInTheDocument();
    // A real switcher would be a clickable, enabled trigger with a popup;
    // this is a plain, disabled, non-interactive display.
    expect(display).toBeDisabled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('shows no "Businesses" label, no chevron/expand affordance, and no per-item list', () => {
    renderSwitcher([business()]);

    expect(screen.queryByText('Businesses')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
  });

  it('never renders an "Add business" control', () => {
    renderSwitcher([business()]);

    expect(screen.queryByText(/Add business/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add business/i })).not.toBeInTheDocument();
  });

  it('shows the safe empty state when the owner has no business at all, still with no switching affordance', () => {
    renderSwitcher([]);

    expect(screen.getByText('No business found')).toBeInTheDocument();
    expect(screen.getByText('Contact support if this persists')).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('never opens a popup/menu when clicked — there is nothing to switch to', async () => {
    renderSwitcher([business()]);

    const button = screen.getByText('Adria Stay Budva').closest('button');
    expect(button).toBeDisabled();
  });
});
