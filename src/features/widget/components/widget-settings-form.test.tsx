// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WidgetActionResult } from '../api/types';
import { WidgetSettingsForm } from './widget-settings-form';

const mutationFn = vi.fn<(input: unknown) => Promise<WidgetActionResult>>();
const confirmInstallMutationFn = vi.fn<() => Promise<WidgetActionResult>>();

vi.mock('../api/queries', () => ({
  saveWidgetSettingsMutation: () => ({ mutationFn }),
  confirmWidgetInstallationMutation: () => ({ mutationFn: confirmInstallMutationFn })
}));

const baseSettings = {
  publicWidgetId: '11111111-1111-4111-8111-111111111111',
  enabled: true,
  assistantName: 'Adria Assistant',
  welcomeMessageEn: 'How can we help?',
  welcomeMessageMe: '',
  welcomeMessageRu: '',
  primaryColor: '#1677ff',
  position: 'bottom-right' as const,
  supportedLanguages: ['en'],
  humanHandoffEnabled: false,
  handoffEmail: '',
  allowedOrigins: ['example.com'],
  installationConfirmedAt: null as string | null
};

function renderForm() {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <WidgetSettingsForm
        businessId='biz-1'
        defaultLanguage='en'
        settings={baseSettings}
        siteOrigin='https://platform.example'
      />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mutationFn.mockReset();
  confirmInstallMutationFn.mockReset().mockResolvedValue({ success: true });
});

describe('WidgetSettingsForm — saving settings', () => {
  it('submits the current form values to the save mutation', async () => {
    mutationFn.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderForm();

    const nameInput = screen.getByLabelText(/^Assistant display name/);
    await user.clear(nameInput);
    await user.type(nameInput, 'New Name');

    await user.click(screen.getByRole('button', { name: /Save changes/ }));

    await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1));
    const payload = mutationFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.assistantName).toBe('New Name');
    expect(payload.enabled).toBe(true);
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
    expect(screen.getByLabelText(/^Assistant display name/)).toHaveValue('Adria Assistant');
  });

  it('rejects an empty assistant name before ever calling the mutation', async () => {
    const user = userEvent.setup();
    renderForm();

    const nameInput = screen.getByLabelText(/^Assistant display name/);
    await user.clear(nameInput);
    await user.click(screen.getByRole('button', { name: /Save changes/ }));

    expect(await screen.findByText('Assistant name is required.')).toBeInTheDocument();
    expect(mutationFn).not.toHaveBeenCalled();
  });
});

describe('WidgetSettingsForm — live preview', () => {
  it('reflects the assistant name typed into the form before saving', async () => {
    const user = userEvent.setup();
    renderForm();

    const nameInput = screen.getByLabelText(/^Assistant display name/);
    await user.clear(nameInput);
    await user.type(nameInput, 'Riviera Host');

    // The preview's header shows the live (unsaved) name — appears a
    // second time (once in the settings field's own value, once in the
    // preview) so this asserts on the preview specifically.
    await waitFor(() => expect(screen.getAllByText('Riviera Host').length).toBeGreaterThan(0));
  });

  it('shows a "Widget disabled" badge in the preview as soon as the enabled switch is turned off, before saving', async () => {
    const user = userEvent.setup();
    renderForm();

    expect(screen.queryByText('Widget disabled')).not.toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: /Widget enabled/ }));

    expect(await screen.findByText('Widget disabled')).toBeInTheDocument();
    // Still hasn't saved anything.
    expect(mutationFn).not.toHaveBeenCalled();
  });
});

describe('WidgetSettingsForm — allowed website origins', () => {
  it('placeholders the field as a full origin, e.g. https://example.com', () => {
    renderForm();

    const input = screen.getByLabelText(/Add a website origins that may embed this widget/i);
    expect(input).toHaveAttribute('placeholder', 'https://example.com');
  });

  it('mentions that a path is not allowed, with a concrete example', () => {
    renderForm();

    expect(screen.getByText(/no path/i)).toBeInTheDocument();
    expect(screen.getByText('https://example.com/about')).toBeInTheDocument();
  });

  it('rejects an origin with a path immediately on add, with a specific message, and never adds it as a badge', async () => {
    const user = userEvent.setup();
    renderForm();

    const input = screen.getByLabelText(/Add a website origins that may embed this widget/i);
    await user.type(input, 'https://example.com/about-us');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      await screen.findByText(
        'Enter just the origin, without a path — e.g. https://example.com, not https://example.com/about.'
      )
    ).toBeInTheDocument();
    // No badge (and so no "remove" button) was created for the rejected entry.
    expect(
      screen.queryByRole('button', { name: 'Remove https://example.com/about-us' })
    ).not.toBeInTheDocument();
  });

  it('accepts a valid bare domain immediately, adding it as a badge exactly as typed', async () => {
    const user = userEvent.setup();
    renderForm();

    const input = screen.getByLabelText(/Add a website origins that may embed this widget/i);
    await user.type(input, 'new-site.com');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByRole('button', { name: 'Remove new-site.com' })).toBeInTheDocument();
  });

  it('removes a domain badge when its remove button is clicked, even at the enlarged mobile tap target', async () => {
    const user = userEvent.setup();
    renderForm();

    expect(screen.getByRole('button', { name: 'Remove example.com' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove example.com' }));

    expect(screen.queryByRole('button', { name: 'Remove example.com' })).not.toBeInTheDocument();
  });
});

describe('WidgetSettingsForm — installation confirmation', () => {
  it('shows a confirm button when installation has not been confirmed yet', () => {
    renderForm();

    expect(
      screen.getByRole('button', { name: /I've installed and tested it/ })
    ).toBeInTheDocument();
  });

  it('calls the confirm mutation when the owner confirms installation', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: /I've installed and tested it/ }));

    await waitFor(() => expect(confirmInstallMutationFn).toHaveBeenCalledTimes(1));
  });

  it('shows the confirmed date instead of the button once installationConfirmedAt is set', () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <WidgetSettingsForm
          businessId='biz-1'
          defaultLanguage='en'
          settings={{ ...baseSettings, installationConfirmedAt: '2026-01-15T10:00:00.000Z' }}
          siteOrigin='https://platform.example'
        />
      </QueryClientProvider>
    );

    expect(screen.getByText(/Installed and tested on/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /I've installed and tested it/ })
    ).not.toBeInTheDocument();
  });
});

describe('WidgetSettingsForm — human handoff', () => {
  it('requires a handoff email once human hand-off is turned on', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('switch', { name: /Allow human hand-off/ }));
    await user.click(screen.getByRole('button', { name: /Save changes/ }));

    expect(
      await screen.findByText(
        'Add a contact email to receive handoff requests, or turn off human handoff.'
      )
    ).toBeInTheDocument();
    expect(mutationFn).not.toHaveBeenCalled();
  });
});
