// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InstallSnippetCard, buildInstallSnippet } from './install-snippet-card';

const PUBLIC_WIDGET_ID = '11111111-1111-4111-8111-111111111111';
const SITE_ORIGIN = 'https://platform.example';

describe('buildInstallSnippet', () => {
  it('points at this platform’s own widget-loader.js, with the real widget id as a data attribute', () => {
    const snippet = buildInstallSnippet(SITE_ORIGIN, PUBLIC_WIDGET_ID);

    expect(snippet).toBe(
      `<script src="${SITE_ORIGIN}/widget-loader.js" data-widget-id="${PUBLIC_WIDGET_ID}" async></script>`
    );
  });
});

describe('InstallSnippetCard', () => {
  it('shows the public widget id and the real installation snippet', () => {
    render(<InstallSnippetCard siteOrigin={SITE_ORIGIN} publicWidgetId={PUBLIC_WIDGET_ID} />);

    expect(screen.getByText(PUBLIC_WIDGET_ID)).toBeInTheDocument();
    expect(
      screen.getByText(buildInstallSnippet(SITE_ORIGIN, PUBLIC_WIDGET_ID))
    ).toBeInTheDocument();
  });

  it('copies the exact snippet to the clipboard and shows a "Copied" confirmation', async () => {
    const user = userEvent.setup();
    // jsdom (via user-event's own setup()) provides a real
    // navigator.clipboard implementation — spying on it here (after
    // setup(), which is what actually installs it) is what intercepts
    // the call; replacing the object beforehand gets clobbered by
    // user-event's own install step.
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    render(<InstallSnippetCard siteOrigin={SITE_ORIGIN} publicWidgetId={PUBLIC_WIDGET_ID} />);

    await user.click(screen.getByRole('button', { name: /Copy code/ }));

    expect(writeText).toHaveBeenCalledWith(buildInstallSnippet(SITE_ORIGIN, PUBLIC_WIDGET_ID));
    expect(await screen.findByRole('button', { name: /Copied/ })).toBeInTheDocument();
  });

  it('shows the paste-before-</body>, publish, and test-as-a-visitor instructions', () => {
    render(<InstallSnippetCard siteOrigin={SITE_ORIGIN} publicWidgetId={PUBLIC_WIDGET_ID} />);

    expect(screen.getByText(/paste it just before the closing/)).toBeInTheDocument();
    expect(screen.getByText(/Publish\/deploy your website\./)).toBeInTheDocument();
    expect(screen.getByText(/Open your live site as a visitor/)).toBeInTheDocument();
  });
});
