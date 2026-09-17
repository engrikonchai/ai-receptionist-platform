// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BillingStatusResult } from '../api/types';
import { BillingView } from './billing-view';

const fetchStatus = vi.fn<() => Promise<BillingStatusResult>>();
const checkoutMutationFn = vi.fn();
const portalMutationFn = vi.fn();

vi.mock('../api/queries', () => ({
  billingStatusOptions: (businessId: string) => ({
    queryKey: ['billing', businessId, 'status'],
    queryFn: fetchStatus
  }),
  startCheckoutMutation: () => ({ mutationFn: checkoutMutationFn }),
  openCustomerPortalMutation: () => ({ mutationFn: portalMutationFn })
}));

// Real navigation is impossible in jsdom (and would be wrong to trigger
// in a test anyway) — capture the href a successful mutation assigns.
let assignedHref: string | null = null;
Object.defineProperty(window, 'location', {
  configurable: true,
  value: {
    ...window.location,
    set href(value: string) {
      assignedHref = value;
    },
    get href() {
      return assignedHref ?? '';
    }
  }
});

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <NuqsTestingAdapter>
        <BillingView businessId='biz-1' />
      </NuqsTestingAdapter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  fetchStatus.mockReset();
  checkoutMutationFn.mockReset();
  portalMutationFn.mockReset();
  assignedHref = null;
});

describe('BillingView — loading and error states', () => {
  it('shows a loading skeleton while the query is pending, not any subscription content', () => {
    fetchStatus.mockReturnValue(new Promise(() => {}));
    renderView();

    expect(screen.queryByText('Start free trial')).not.toBeInTheDocument();
    expect(screen.queryByText('Manage billing')).not.toBeInTheDocument();
  });

  it('shows a friendly error state with a retry button on failure', async () => {
    fetchStatus.mockRejectedValue(new Error('We could not load billing. Please try again.'));
    renderView();

    expect(
      await screen.findByText('We could not load billing. Please try again.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });
});

describe('BillingView — not configured / empty state', () => {
  it('shows a clear not-configured state instead of fake subscription data', async () => {
    fetchStatus.mockResolvedValue({ status: 'not_configured' });
    renderView();

    expect(await screen.findByText("Billing isn't set up yet")).toBeInTheDocument();
    expect(screen.queryByText('Start free trial')).not.toBeInTheDocument();
  });
});

describe('BillingView — no subscription yet', () => {
  it('shows a "Start free trial" action and the live plan price, never a hardcoded amount', async () => {
    fetchStatus.mockResolvedValue({
      status: 'ok',
      plan: { productName: 'Pro plan', unitAmount: 2900, currency: 'usd', interval: 'month' },
      subscription: null
    });
    renderView();

    expect(await screen.findByText('Pro plan')).toBeInTheDocument();
    expect(screen.getByText('$29.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start free trial' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manage billing' })).not.toBeInTheDocument();
  });
});

describe('BillingView — trialing', () => {
  it('shows the trial end date and no "Start free trial" button', async () => {
    fetchStatus.mockResolvedValue({
      status: 'ok',
      plan: { productName: 'Pro plan', unitAmount: 2900, currency: 'usd', interval: 'month' },
      subscription: {
        status: 'trialing',
        trialEnd: '2026-02-15T00:00:00.000Z',
        currentPeriodEnd: '2026-02-15T00:00:00.000Z',
        cancelAtPeriodEnd: false,
        hasStripeCustomer: true
      }
    });
    renderView();

    expect(await screen.findByText(/Trial ends/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start free trial' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Manage billing' })).toBeInTheDocument();
  });
});

describe('BillingView — active with scheduled cancellation', () => {
  it('shows that cancellation is scheduled', async () => {
    fetchStatus.mockResolvedValue({
      status: 'ok',
      plan: null,
      subscription: {
        status: 'active',
        trialEnd: null,
        currentPeriodEnd: '2026-03-01T00:00:00.000Z',
        cancelAtPeriodEnd: true,
        hasStripeCustomer: true
      }
    });
    renderView();

    expect(
      await screen.findByText(
        'Your subscription is set to cancel at the end of the current period.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/Access ends/)).toBeInTheDocument();
  });
});

describe('BillingView — payment problem', () => {
  it('shows a clear payment-problem warning for past_due', async () => {
    fetchStatus.mockResolvedValue({
      status: 'ok',
      plan: null,
      subscription: {
        status: 'past_due',
        trialEnd: null,
        currentPeriodEnd: '2026-03-01T00:00:00.000Z',
        cancelAtPeriodEnd: false,
        hasStripeCustomer: true
      }
    });
    renderView();

    expect(await screen.findByText("There's a problem with your payment")).toBeInTheDocument();
  });

  it('shows the same warning for unpaid', async () => {
    fetchStatus.mockResolvedValue({
      status: 'ok',
      plan: null,
      subscription: {
        status: 'unpaid',
        trialEnd: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        hasStripeCustomer: true
      }
    });
    renderView();

    expect(await screen.findByText("There's a problem with your payment")).toBeInTheDocument();
  });

  it('never shows the warning for a healthy active subscription', async () => {
    fetchStatus.mockResolvedValue({
      status: 'ok',
      plan: null,
      subscription: {
        status: 'active',
        trialEnd: null,
        currentPeriodEnd: '2026-03-01T00:00:00.000Z',
        cancelAtPeriodEnd: false,
        hasStripeCustomer: true
      }
    });
    renderView();

    await screen.findByText('Active');
    expect(screen.queryByText("There's a problem with your payment")).not.toBeInTheDocument();
  });
});

describe('BillingView — actions', () => {
  it('redirects to the returned Stripe Checkout URL on success', async () => {
    fetchStatus.mockResolvedValue({
      status: 'ok',
      plan: { productName: 'Pro plan', unitAmount: 2900, currency: 'usd', interval: 'month' },
      subscription: null
    });
    checkoutMutationFn.mockResolvedValue({
      status: 'ok',
      url: 'https://checkout.stripe.com/session_abc'
    });
    renderView();

    const button = await screen.findByRole('button', { name: 'Start free trial' });
    button.click();

    await waitFor(() => expect(assignedHref).toBe('https://checkout.stripe.com/session_abc'));
  });

  it('redirects to the returned Stripe Billing Portal URL on success', async () => {
    fetchStatus.mockResolvedValue({
      status: 'ok',
      plan: null,
      subscription: {
        status: 'active',
        trialEnd: null,
        currentPeriodEnd: '2026-03-01T00:00:00.000Z',
        cancelAtPeriodEnd: false,
        hasStripeCustomer: true
      }
    });
    portalMutationFn.mockResolvedValue({
      status: 'ok',
      url: 'https://billing.stripe.com/session_xyz'
    });
    renderView();

    const button = await screen.findByRole('button', { name: 'Manage billing' });
    button.click();

    await waitFor(() => expect(assignedHref).toBe('https://billing.stripe.com/session_xyz'));
  });
});
