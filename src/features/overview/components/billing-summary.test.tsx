// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BillingSummary } from './billing-summary';

describe('BillingSummary', () => {
  it('shows a real "no subscription yet" state with a View billing link, never an invented plan', () => {
    render(<BillingSummary subscription={null} />);

    expect(
      screen.getByText('Start your subscription to keep using the AI receptionist.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage billing' })).toHaveAttribute(
      'href',
      '/dashboard/billing'
    );
    expect(screen.getByText('View billing')).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it('shows the real trialing status and trial-end date', () => {
    render(
      <BillingSummary
        subscription={{
          status: 'trialing',
          trial_end: '2026-03-15T00:00:00Z',
          current_period_end: null,
          cancel_at_period_end: false
        }}
      />
    );

    expect(screen.getByText('Trial')).toBeInTheDocument();
    expect(screen.getByText('Trial ends 15 Mar 2026.')).toBeInTheDocument();
  });

  it('shows a real active subscription renewing on its real period-end date', () => {
    render(
      <BillingSummary
        subscription={{
          status: 'active',
          trial_end: null,
          current_period_end: '2026-04-01T00:00:00Z',
          cancel_at_period_end: false
        }}
      />
    );

    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Renews 01 Apr 2026.')).toBeInTheDocument();
    expect(screen.getByText('Manage billing')).toBeInTheDocument();
  });

  it('shows access-ends copy when the subscription is set to cancel at period end', () => {
    render(
      <BillingSummary
        subscription={{
          status: 'active',
          trial_end: null,
          current_period_end: '2026-04-01T00:00:00Z',
          cancel_at_period_end: true
        }}
      />
    );

    expect(screen.getByText('Access ends 01 Apr 2026.')).toBeInTheDocument();
  });

  it('surfaces a real past-due payment problem with a non-color-only status pill', () => {
    render(
      <BillingSummary
        subscription={{
          status: 'past_due',
          trial_end: null,
          current_period_end: '2026-04-01T00:00:00Z',
          cancel_at_period_end: false
        }}
      />
    );

    expect(screen.getByText('Payment past due')).toBeInTheDocument();
    expect(screen.getByText("There's a problem with your last payment.")).toBeInTheDocument();
    // Never silently shows a renewal date alongside an active payment problem.
    expect(screen.queryByText(/Renews/)).not.toBeInTheDocument();
  });

  it('shows a real canceled subscription status', () => {
    render(
      <BillingSummary
        subscription={{
          status: 'canceled',
          trial_end: null,
          current_period_end: null,
          cancel_at_period_end: false
        }}
      />
    );

    expect(screen.getByText('Canceled')).toBeInTheDocument();
  });
});
