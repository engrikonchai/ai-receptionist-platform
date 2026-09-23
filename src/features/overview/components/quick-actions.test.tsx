// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QuickActions } from './quick-actions';

describe('QuickActions', () => {
  it('links to exactly the three real, existing Overview destinations', () => {
    render(<QuickActions activeKnowledgeItemCount={3} widgetEnabled={true} />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/dashboard/inbox',
      '/dashboard/knowledge',
      '/dashboard/widget'
    ]);
  });

  it('never adds an unsupported destination like Agent or Team', () => {
    render(<QuickActions activeKnowledgeItemCount={3} widgetEnabled={true} />);

    for (const href of ['/dashboard/agent', '/dashboard/team', '/dashboard/settings']) {
      expect(screen.queryByRole('link', { name: new RegExp(href) })).not.toBeInTheDocument();
    }
  });

  it('shows the real active knowledge item count, correctly pluralized', () => {
    render(<QuickActions activeKnowledgeItemCount={1} widgetEnabled={true} />);
    expect(screen.getByText('1 active entry')).toBeInTheDocument();
  });

  it('shows the real active knowledge item count when there is more than one', () => {
    render(<QuickActions activeKnowledgeItemCount={4} widgetEnabled={true} />);
    expect(screen.getByText('4 active entries')).toBeInTheDocument();
  });

  it('shows a real zero-state for Knowledge when there are no active entries', () => {
    render(<QuickActions activeKnowledgeItemCount={0} widgetEnabled={true} />);
    expect(screen.getByText('No active entries yet')).toBeInTheDocument();
  });

  it('reflects the real widget-enabled state', () => {
    render(<QuickActions activeKnowledgeItemCount={0} widgetEnabled={true} />);
    expect(screen.getByText('Widget is live')).toBeInTheDocument();
  });

  it('reflects the real widget-disabled state', () => {
    render(<QuickActions activeKnowledgeItemCount={0} widgetEnabled={false} />);
    expect(screen.getByText('Widget is not yet enabled')).toBeInTheDocument();
  });
});
