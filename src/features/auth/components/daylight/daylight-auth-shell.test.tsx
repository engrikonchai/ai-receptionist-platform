// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DaylightAuthShell } from './daylight-auth-shell';

describe('DaylightAuthShell', () => {
  it('renders the title as a heading, the description, and the given children', () => {
    render(
      <DaylightAuthShell title='Sign in' description='Sign in to manage your business.'>
        <p>form goes here</p>
      </DaylightAuthShell>
    );

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText('Sign in to manage your business.')).toBeInTheDocument();
    expect(screen.getByText('form goes here')).toBeInTheDocument();
  });

  it('always gives a real, working link back to the public landing page', () => {
    render(
      <DaylightAuthShell title='Sign in' description='desc'>
        <div />
      </DaylightAuthShell>
    );

    expect(screen.getByRole('link', { name: /Back to Platform/ })).toHaveAttribute('href', '/');
  });
});
