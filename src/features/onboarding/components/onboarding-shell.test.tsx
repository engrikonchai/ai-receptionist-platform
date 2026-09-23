// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OnboardingShell } from './onboarding-shell';

describe('OnboardingShell', () => {
  it('renders a real link back to the public landing page and the given children', () => {
    render(
      <OnboardingShell>
        <p>wizard step goes here</p>
      </OnboardingShell>
    );

    expect(screen.getByRole('link', { name: /Platform/ })).toHaveAttribute('href', '/');
    expect(screen.getByText('wizard step goes here')).toBeInTheDocument();
  });
});
