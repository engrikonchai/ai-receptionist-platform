// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DaylightFormMessage } from './daylight-form-message';

describe('DaylightFormMessage', () => {
  it('renders an error variant as role="alert"', () => {
    render(<DaylightFormMessage variant='error'>Something went wrong.</DaylightFormMessage>);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong.');
  });

  it('renders success and info variants as role="status", never role="alert"', () => {
    render(<DaylightFormMessage variant='success'>Saved.</DaylightFormMessage>);
    expect(screen.getByRole('status')).toHaveTextContent('Saved.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
