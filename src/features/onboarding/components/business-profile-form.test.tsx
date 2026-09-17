// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessProfileForm } from './business-profile-form';
import type { OnboardingActionResult } from '../api/types';

const mutationFn = vi.fn<(input: unknown) => Promise<OnboardingActionResult>>();

vi.mock('../api/queries', () => ({
  saveBusinessInfoStepMutation: () => ({ mutationFn })
}));

const defaultValues = {
  businessName: 'Riviera Stay Apartments',
  businessType: 'apartment' as const,
  location: 'Budva, Montenegro',
  defaultLanguage: 'en' as const,
  supportedLanguages: ['en' as const]
};

function renderForm() {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <BusinessProfileForm businessId='biz-1' defaultValues={defaultValues} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mutationFn.mockReset();
});

describe('BusinessProfileForm', () => {
  it('pre-fills the form with the active business’s current values', () => {
    renderForm();

    expect(screen.getByLabelText(/^Business name/)).toHaveValue('Riviera Stay Apartments');
    expect(screen.getByLabelText(/^Location/)).toHaveValue('Budva, Montenegro');
  });

  it('saves the edited profile via the shared onboarding business-info action', async () => {
    mutationFn.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderForm();

    const nameInput = screen.getByLabelText(/^Business name/);
    await user.clear(nameInput);
    await user.type(nameInput, 'New Name');
    await user.click(screen.getByRole('button', { name: /Save changes/ }));

    await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1));
    const payload = mutationFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.businessName).toBe('New Name');
  });

  it('shows a friendly error and keeps the typed values when saving fails', async () => {
    mutationFn.mockResolvedValue({
      success: false,
      error: 'Something went wrong. Please try again.'
    });
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: /Save changes/ }));

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Business name/)).toHaveValue('Riviera Stay Apartments');
  });

  it('rejects an empty business name before ever calling the mutation', async () => {
    const user = userEvent.setup();
    renderForm();

    const nameInput = screen.getByLabelText(/^Business name/);
    await user.clear(nameInput);
    await user.click(screen.getByRole('button', { name: /Save changes/ }));

    expect(await screen.findByText('Business name is required.')).toBeInTheDocument();
    expect(mutationFn).not.toHaveBeenCalled();
  });
});
