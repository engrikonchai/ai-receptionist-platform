// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const initializePaddle = vi.fn();
const checkoutOpen = vi.fn();
const fakePaddleInstance = { Checkout: { open: checkoutOpen } };

vi.mock('@paddle/paddle-js', async () => {
  const actual = await vi.importActual<typeof import('@paddle/paddle-js')>('@paddle/paddle-js');
  return {
    ...actual,
    initializePaddle: (...args: unknown[]) => initializePaddle(...args)
  };
});

// Real navigation is impossible in jsdom (and would be wrong to trigger
// in a test anyway) — capture the href a successful portal mutation
// assigns. Checkout no longer navigates at all — it opens the Paddle.js
// overlay in place (captured via `checkoutOpen` instead).
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
      <BillingView businessId='biz-1' />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  fetchStatus.mockReset();
  checkoutMutationFn.mockReset();
  portalMutationFn.mockReset();
  initializePaddle.mockReset();
  checkoutOpen.mockReset();
  initializePaddle.mockResolvedValue(fakePaddleInstance);
  assignedHref = null;
  vi.stubEnv('NEXT_PUBLIC_PADDLE_CLIENT_TOKEN', 'test_client_token');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('BillingView — loading and error states', () => {
  it('shows a loading skeleton while the query is pending, not any subscription content', () => {
    fetchStatus.mockReturnValue(new Promise(() => {}));
    renderView();

    expect(screen.queryByText('Start subscription')).not.toBeInTheDocument();
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
    expect(screen.queryByText('Start subscription')).not.toBeInTheDocument();
  });
});

describe('BillingView — Paddle.js sandbox initialization', () => {
  it('initializes Paddle.js with the public client token and the server-validated sandbox environment', async () => {
    fetchStatus.mockResolvedValue({
      status: 'ok',
      plan: null,
      subscription: null,
      environment: 'sandbox'
    });
    renderView();

    await screen.findByText('Start subscription');

    await waitFor(() =>
      expect(initializePaddle).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'test_client_token', environment: 'sandbox' })
      )
    );
  });

  it('shows a clear Sandbox/Test Mode label when running against the Paddle sandbox', async () => {
    fetchStatus.mockResolvedValue({
      status: 'ok',
      plan: null,
      subscription: null,
      environment: 'sandbox'
    });
    renderView();

    expect(await screen.findByText('Sandbox / Test Mode')).toBeInTheDocument();
  });

  it('never initializes Paddle.js without a configured client token', async () => {
    vi.stubEnv('NEXT_PUBLIC_PADDLE_CLIENT_TOKEN', '');
    fetchStatus.mockResolvedValue({
      status: 'ok',
      plan: null,
      subscription: null,
      environment: 'sandbox'
    });
    renderView();

    await screen.findByText('Start subscription');
    expect(initializePaddle).not.toHaveBeenCalled();
  });
});

describe('BillingView — no subscription yet', () => {
  it('shows a "Start subscription" action and the live plan price, never a hardcoded amount', async () => {
    fetchStatus.mockResolvedValue({
      status: 'ok',
      plan: { productName: 'Pro plan', unitAmount: 2900, currency: 'usd', interval: 'month' },
      subscription: null,
      environment: 'sandbox'
    });
    renderView();

    expect(await screen.findByText('Pro plan')).toBeInTheDocument();
    expect(screen.getByText('$29.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start subscription' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manage billing' })).not.toBeInTheDocument();
  });
});

describe('BillingView — trialing', () => {
  it('shows the trial end date and no "Start subscription" button', async () => {
    fetchStatus.mockResolvedValue({
      status: 'ok',
      plan: { productName: 'Pro plan', unitAmount: 2900, currency: 'usd', interval: 'month' },
      subscription: {
        status: 'trialing',
        trialEnd: '2026-02-15T00:00:00.000Z',
        currentPeriodEnd: '2026-02-15T00:00:00.000Z',
        cancelAtPeriodEnd: false,
        hasPaddleCustomer: true
      },
      environment: 'sandbox'
    });
    renderView();

    expect(await screen.findByText(/Trial ends/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start subscription' })).not.toBeInTheDocument();
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
        hasPaddleCustomer: true
      },
      environment: 'sandbox'
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
        hasPaddleCustomer: true
      },
      environment: 'sandbox'
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
        hasPaddleCustomer: true
      },
      environment: 'sandbox'
    });
    renderView();

    await screen.findByText('Active');
    expect(screen.queryByText("There's a problem with your payment")).not.toBeInTheDocument();
  });
});

describe('BillingView — actions', () => {
  it('opens the Paddle.js Checkout overlay with the returned transaction id on success — never a redirect, never granting access itself', async () => {
    fetchStatus.mockResolvedValue({
      status: 'ok',
      plan: { productName: 'Pro plan', unitAmount: 2900, currency: 'usd', interval: 'month' },
      subscription: null,
      environment: 'sandbox'
    });
    checkoutMutationFn.mockResolvedValue({ status: 'ok', transactionId: 'txn_abc123' });
    renderView();

    await waitFor(() => expect(initializePaddle).toHaveBeenCalled());
    const button = await screen.findByRole('button', { name: 'Start subscription' });
    button.click();

    await waitFor(() => expect(checkoutOpen).toHaveBeenCalledWith({ transactionId: 'txn_abc123' }));
    expect(assignedHref).toBeNull();
  });

  it('redirects to the returned Paddle Customer Portal URL on success', async () => {
    fetchStatus.mockResolvedValue({
      status: 'ok',
      plan: null,
      subscription: {
        status: 'active',
        trialEnd: null,
        currentPeriodEnd: '2026-03-01T00:00:00.000Z',
        cancelAtPeriodEnd: false,
        hasPaddleCustomer: true
      },
      environment: 'sandbox'
    });
    portalMutationFn.mockResolvedValue({
      status: 'ok',
      url: 'https://sandbox-customer-portal.paddle.com/session_xyz'
    });
    renderView();

    const button = await screen.findByRole('button', { name: 'Manage billing' });
    button.click();

    await waitFor(() =>
      expect(assignedHref).toBe('https://sandbox-customer-portal.paddle.com/session_xyz')
    );
  });
});
