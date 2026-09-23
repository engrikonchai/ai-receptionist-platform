// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icons } from '@/components/icons';
import { MetricTile } from './metric-tile';

describe('MetricTile', () => {
  it('renders the label and real value, linking to the given destination', () => {
    render(
      <MetricTile
        icon={Icons.leads}
        label='New leads'
        value={3}
        href='/dashboard/leads'
        hrefLabel='3 new leads — view leads'
      />
    );

    expect(screen.getByText('New leads')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: '3 new leads — view leads' });
    expect(link).toHaveAttribute('href', '/dashboard/leads');
  });

  it('is a single focusable link — no nested interactive elements', () => {
    render(
      <MetricTile
        icon={Icons.leads}
        label='New leads'
        value={0}
        href='/dashboard/leads'
        hrefLabel='0 new leads — view leads'
      />
    );

    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows an optional zero-state/status hint when provided', () => {
    render(
      <MetricTile
        icon={Icons.leads}
        label='New leads'
        value={0}
        href='/dashboard/leads'
        hrefLabel='0 new leads — view leads'
        hint='None waiting right now'
      />
    );

    expect(screen.getByText('None waiting right now')).toBeInTheDocument();
  });

  it('renders no hint text at all when none is given', () => {
    const { container } = render(
      <MetricTile
        icon={Icons.leads}
        label='New leads'
        value={5}
        href='/dashboard/leads'
        hrefLabel='5 new leads — view leads'
      />
    );

    // Only label + numeral text nodes — no third hint span.
    expect(container.querySelectorAll('span').length).toBeLessThanOrEqual(3);
  });
});
