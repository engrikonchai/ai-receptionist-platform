// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SetupChecklist } from './setup-checklist';
import { computeSetupProgress } from '../utils/setup-progress';

const incompleteProgress = computeSetupProgress({
  business: {
    name: 'Riviera Stay',
    business_type: 'apartment',
    default_language: 'en',
    supported_languages: ['en']
  },
  widget: {
    widget_enabled: false,
    title: '',
    welcome_message_en: null,
    welcome_message_me: null,
    welcome_message_ru: null,
    allowed_origins: [],
    installation_confirmed: false
  },
  activeKnowledgeItemCount: 1
});

const completeProgress = computeSetupProgress({
  business: {
    name: 'Riviera Stay',
    business_type: 'apartment',
    default_language: 'en',
    supported_languages: ['en']
  },
  widget: {
    widget_enabled: true,
    title: 'Adria Assistant',
    welcome_message_en: 'Hi!',
    welcome_message_me: null,
    welcome_message_ru: null,
    allowed_origins: ['https://example.com'],
    installation_confirmed: true
  },
  activeKnowledgeItemCount: 3
});

describe('SetupChecklist', () => {
  it('shows "X of Y completed" progress', () => {
    render(<SetupChecklist progress={incompleteProgress} />);

    expect(screen.getByText('2 of 5 completed')).toBeInTheDocument();
  });

  it('starts expanded when incomplete, listing every item', () => {
    render(<SetupChecklist progress={incompleteProgress} />);

    expect(screen.getByText('Business profile completed')).toBeInTheDocument();
    expect(screen.getByText('At least one active knowledge item added')).toBeInTheDocument();
    expect(screen.getByText('Widget configured and enabled')).toBeInTheDocument();
    expect(screen.getByText('At least one allowed origin added')).toBeInTheDocument();
    expect(screen.getByText('Widget installation acknowledged')).toBeInTheDocument();
  });

  it('links each incomplete item to its correct dashboard page', () => {
    render(<SetupChecklist progress={incompleteProgress} />);

    expect(screen.getByRole('link', { name: /Widget configured and enabled/ })).toHaveAttribute(
      'href',
      '/dashboard/widget'
    );
    expect(screen.getByRole('link', { name: /At least one allowed origin added/ })).toHaveAttribute(
      'href',
      '/dashboard/widget'
    );
  });

  it('does not render a link for an already-completed item', () => {
    render(<SetupChecklist progress={incompleteProgress} />);

    // "Business profile completed" is done in this fixture (name/type/
    // language/supported all present) — no link, just a checked row.
    expect(
      screen.queryByRole('link', { name: /Business profile completed/ })
    ).not.toBeInTheDocument();
  });

  it('starts collapsed once every item is complete, but stays reopenable', async () => {
    const user = userEvent.setup();
    render(<SetupChecklist progress={completeProgress} />);

    expect(screen.getByText('5 of 5 completed')).toBeInTheDocument();
    expect(screen.queryByText('Widget installation acknowledged')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Setup checklist/ }));

    expect(screen.getByText('Widget installation acknowledged')).toBeInTheDocument();
  });

  it('can be collapsed again after reopening', async () => {
    const user = userEvent.setup();
    render(<SetupChecklist progress={completeProgress} />);

    const toggle = screen.getByRole('button', { name: /Setup checklist/ });
    await user.click(toggle);
    expect(screen.getByText('Widget installation acknowledged')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Collapse' }));
    expect(screen.queryByText('Widget installation acknowledged')).not.toBeInTheDocument();
  });
});
