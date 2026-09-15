import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { GET } from './route';

vi.mock('@/lib/supabase/env', () => ({
  isSupabaseConfigured: vi.fn(() => true)
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn()
}));

function mockExchange(error: { message: string } | null) {
  vi.mocked(createSupabaseServerClient).mockResolvedValue({
    auth: {
      exchangeCodeForSession: vi.fn().mockResolvedValue({ error })
    }
  } as unknown as SupabaseClient);
}

function locationOf(response: Response): URL {
  const location = response.headers.get('location');
  if (!location) throw new Error('Expected a redirect Location header');
  return new URL(location);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isSupabaseConfigured).mockReturnValue(true);
});

describe('GET /auth/callback', () => {
  it('redirects to the safe next path after a successful signup-confirmation exchange', async () => {
    mockExchange(null);
    const request = new Request(
      'https://app.example.com/auth/callback?code=abc123&next=%2Fonboarding'
    );

    const response = await GET(request);

    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    expect(locationOf(response).pathname).toBe('/onboarding');
  });

  it('accepts next=/reset-password and redirects there after a successful recovery exchange', async () => {
    mockExchange(null);
    const request = new Request(
      'https://app.example.com/auth/callback?code=abc123&next=%2Freset-password'
    );

    const response = await GET(request);

    expect(locationOf(response).pathname).toBe('/reset-password');
  });

  it('rejects an external redirect target and falls back to the default dashboard path', async () => {
    mockExchange(null);
    const request = new Request(
      'https://app.example.com/auth/callback?code=abc123&next=https%3A%2F%2Fevil.example'
    );

    const response = await GET(request);
    const location = locationOf(response);

    expect(location.toString()).not.toContain('evil.example');
    expect(location.pathname).toBe('/dashboard/overview');
  });

  it('rejects a protocol-relative // redirect target', async () => {
    mockExchange(null);
    const request = new Request(
      'https://app.example.com/auth/callback?code=abc123&next=%2F%2Fevil.example'
    );

    const response = await GET(request);

    expect(locationOf(response).toString()).not.toContain('evil.example');
  });

  it('rejects a backslash-variant redirect target', async () => {
    mockExchange(null);
    const request = new Request(
      'https://app.example.com/auth/callback?code=abc123&next=%2F%5Cevil.example'
    );

    const response = await GET(request);

    expect(locationOf(response).toString()).not.toContain('evil.example');
  });

  it('redirects to /login with a signup-flavored error when the code is missing', async () => {
    const request = new Request('https://app.example.com/auth/callback');

    const response = await GET(request);
    const location = locationOf(response);

    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('error')).toContain('Missing confirmation code');
  });

  it('redirects to /login with a recovery-flavored error when the code is missing on a recovery attempt', async () => {
    const request = new Request('https://app.example.com/auth/callback?next=%2Freset-password');

    const response = await GET(request);
    const location = locationOf(response);

    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('error')).toBe(
      'That password reset link is invalid or has expired. Please request a new one.'
    );
  });

  it('redirects to /login with a recovery-flavored error when the code exchange fails on a recovery attempt, never leaking the raw Supabase message', async () => {
    mockExchange({ message: 'invalid_grant: raw internal Supabase detail' });
    const request = new Request(
      'https://app.example.com/auth/callback?code=bad-code&next=%2Freset-password'
    );

    const response = await GET(request);
    const location = locationOf(response);

    expect(location.searchParams.get('error')).toBe(
      'That password reset link is invalid or has expired. Please request a new one.'
    );
    expect(location.searchParams.get('error')).not.toContain('invalid_grant');
  });

  it('redirects to /login with the generic signup-flavored error when the code exchange fails on a non-recovery attempt', async () => {
    mockExchange({ message: 'invalid_grant' });
    const request = new Request('https://app.example.com/auth/callback?code=bad-code');

    const response = await GET(request);
    const location = locationOf(response);

    expect(location.searchParams.get('error')).toContain('confirmation link is invalid');
  });

  it('never includes the raw authorization code anywhere in the redirect location', async () => {
    mockExchange(null);
    const request = new Request(
      'https://app.example.com/auth/callback?code=super-secret-code-value&next=%2Fonboarding'
    );

    const response = await GET(request);

    expect(response.headers.get('location')).not.toContain('super-secret-code-value');
  });
});
