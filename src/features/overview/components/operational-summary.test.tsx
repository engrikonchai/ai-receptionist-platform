// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OperationalSummary } from './operational-summary';

describe('OperationalSummary', () => {
  it('shows a real zero-lead, zero-handoff state with a reassuring hint, no invented metrics', () => {
    render(<OperationalSummary newLeadCount={0} pendingHandoffCount={0} hasError={false} />);

    expect(screen.getByText('New leads')).toBeInTheDocument();
    expect(screen.getByText('Pending handoffs')).toBeInTheDocument();
    expect(screen.getAllByText('0')).toHaveLength(2);
    expect(screen.getByText(/Nothing needs attention yet/)).toBeInTheDocument();
    // No invented metrics — nothing implying response time, conversion, etc.
    expect(screen.queryByText(/response time/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/conversion/i)).not.toBeInTheDocument();
  });

  it('renders a single new lead with correct singular pluralization in the accessible name', () => {
    render(<OperationalSummary newLeadCount={1} pendingHandoffCount={0} hasError={false} />);

    expect(screen.getByRole('link', { name: '1 new lead — view leads' })).toHaveAttribute(
      'href',
      '/dashboard/leads'
    );
  });

  it('renders multiple new leads with correct plural pluralization', () => {
    render(<OperationalSummary newLeadCount={5} pendingHandoffCount={0} hasError={false} />);

    expect(screen.getByRole('link', { name: '5 new leads — view leads' })).toBeInTheDocument();
  });

  it('marks pending handoffs as needing attention and links to the inbox', () => {
    render(<OperationalSummary newLeadCount={0} pendingHandoffCount={2} hasError={false} />);

    const link = screen.getByRole('link', { name: '2 pending handoffs — view inbox' });
    expect(link).toHaveAttribute('href', '/dashboard/inbox');
    expect(screen.getByText('Awaiting a reply')).toBeInTheDocument();
    // The reassurance hint only shows when nothing is pending at all.
    expect(screen.queryByText(/Nothing needs attention yet/)).not.toBeInTheDocument();
  });

  it('shows a single pending handoff with correct singular wording', () => {
    render(<OperationalSummary newLeadCount={0} pendingHandoffCount={1} hasError={false} />);

    expect(
      screen.getByRole('link', { name: '1 pending handoff — view inbox' })
    ).toBeInTheDocument();
  });

  it('shows an explicit failed-to-load state instead of silently rendering zero', () => {
    render(<OperationalSummary newLeadCount={0} pendingHandoffCount={0} hasError={true} />);

    expect(screen.getByText(/couldn't load your leads and handoffs/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /view leads/i })).not.toBeInTheDocument();
  });
});
