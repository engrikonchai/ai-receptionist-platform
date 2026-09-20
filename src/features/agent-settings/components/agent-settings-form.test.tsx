// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentActionResult, AgentSettings } from '../api/types';
import { AGENT_CUSTOM_INSTRUCTIONS_MAX_LENGTH } from '../schemas/agent-settings';
import { AgentSettingsForm } from './agent-settings-form';

const mutationFn = vi.fn<(input: unknown) => Promise<AgentActionResult>>();

vi.mock('../api/queries', () => ({
  updateAgentSettingsMutation: () => ({ mutationFn })
}));

const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (...args: unknown[]) => toastSuccess(...args) }
}));

const baseSettings: AgentSettings = {
  tone: 'professional',
  responseLength: 'balanced',
  customInstructions: null
};

function renderForm(settings: AgentSettings = baseSettings) {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <AgentSettingsForm businessId='biz-1' settings={settings} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mutationFn.mockReset();
  toastSuccess.mockReset();
});

describe('AgentSettingsForm — saving settings', () => {
  it('submits the current tone/response-length/custom-instructions to the save mutation', async () => {
    mutationFn.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('radio', { name: 'Friendly' }));
    await user.click(screen.getByRole('radio', { name: 'Detailed' }));
    await user.type(
      screen.getByLabelText('Custom instructions'),
      'Keep answers practical and direct.'
    );
    await user.click(screen.getByRole('button', { name: /Save changes/ }));

    await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1));
    const payload = mutationFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.tone).toBe('friendly');
    expect(payload.responseLength).toBe('detailed');
    expect(payload.customInstructions).toBe('Keep answers practical and direct.');
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
    expect(screen.getByRole('radio', { name: 'Professional' })).toBeChecked();
  });

  it('shows a success toast, never claimed before the mutation resolves', async () => {
    mutationFn.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderForm();

    expect(toastSuccess).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Save changes/ }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Agent settings saved.'));
  });

  it('disables the submit button while the mutation is pending, preventing duplicate submissions', async () => {
    let resolveMutation!: (value: AgentActionResult) => void;
    mutationFn.mockReturnValue(
      new Promise((resolve) => {
        resolveMutation = resolve;
      })
    );
    const user = userEvent.setup();
    renderForm();

    const submitButton = screen.getByRole('button', { name: /Save changes/ });
    await user.click(submitButton);

    await waitFor(() => expect(submitButton).toBeDisabled());
    expect(mutationFn).toHaveBeenCalledTimes(1);

    resolveMutation({ success: true });
    await waitFor(() => expect(submitButton).not.toBeDisabled());
  });
});

describe('AgentSettingsForm — tone and response length', () => {
  it('pre-selects the currently saved tone and response length', () => {
    renderForm({ tone: 'warm', responseLength: 'concise', customInstructions: null });

    expect(screen.getByRole('radio', { name: 'Warm' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Concise' })).toBeChecked();
  });
});

describe('AgentSettingsForm — custom instructions', () => {
  it('shows a visible character counter against the 4000-character limit', () => {
    renderForm();

    expect(screen.getByText(`0 / ${AGENT_CUSTOM_INSTRUCTIONS_MAX_LENGTH}`)).toBeInTheDocument();
  });

  it('updates the character counter as the owner types', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Custom instructions'), 'Hello');

    expect(screen.getByText(`5 / ${AGENT_CUSTOM_INSTRUCTIONS_MAX_LENGTH}`)).toBeInTheDocument();
  });

  it('pre-fills the saved custom instructions, not example placeholder content', () => {
    renderForm({
      tone: 'professional',
      responseLength: 'balanced',
      customInstructions: 'Avoid making promises about availability.'
    });

    expect(screen.getByLabelText('Custom instructions')).toHaveValue(
      'Avoid making promises about availability.'
    );
  });

  it('leaves custom instructions empty by default — no prefilled example content', () => {
    renderForm();

    expect(screen.getByLabelText('Custom instructions')).toHaveValue('');
  });

  it('is optional — submits successfully with empty custom instructions', async () => {
    mutationFn.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: /Save changes/ }));

    await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1));
    const payload = mutationFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.customInstructions).toBe('');
  });
});

describe('AgentSettingsForm — ownership boundary links', () => {
  it('states that real AI responses are not enabled by this page', () => {
    renderForm();

    expect(
      screen.getByText(/Real AI-generated responses are not enabled by this page yet/)
    ).toBeInTheDocument();
  });

  it('links out to Widget, Business Settings, and Knowledge Base for the fields this page does not own', () => {
    renderForm();

    expect(screen.getByRole('link', { name: 'Widget' })).toHaveAttribute(
      'href',
      '/dashboard/widget'
    );
    expect(screen.getByRole('link', { name: 'Business Settings' })).toHaveAttribute(
      'href',
      '/dashboard/settings'
    );
    expect(screen.getByRole('link', { name: 'Knowledge Base' })).toHaveAttribute(
      'href',
      '/dashboard/knowledge'
    );
  });
});
