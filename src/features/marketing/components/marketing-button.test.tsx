// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarketingButton } from './marketing-button';

describe('MarketingButton', () => {
  it('renders a real link with the given href, never a dead click target', () => {
    render(<MarketingButton href='/signup'>Get started</MarketingButton>);
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/signup');
  });

  it('supports a same-page section anchor as well as a real route', () => {
    render(<MarketingButton href='#product-preview'>See how it works</MarketingButton>);
    expect(screen.getByRole('link', { name: 'See how it works' })).toHaveAttribute(
      'href',
      '#product-preview'
    );
  });

  it('defaults to the primary (indigo) variant', () => {
    render(<MarketingButton href='/signup'>Get started</MarketingButton>);
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveClass('bg-daylight-indigo');
  });

  it('applies the secondary variant classes when requested', () => {
    render(
      <MarketingButton href='/login' variant='secondary'>
        Sign in
      </MarketingButton>
    );
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveClass('bg-daylight-surface');
  });

  it('stretches full width only on mobile when fullWidthOnMobile is set', () => {
    render(
      <MarketingButton href='/signup' fullWidthOnMobile>
        Get started
      </MarketingButton>
    );
    const link = screen.getByRole('link', { name: 'Get started' });
    expect(link.className).toContain('w-full');
    expect(link.className).toContain('sm:w-auto');
  });
});
