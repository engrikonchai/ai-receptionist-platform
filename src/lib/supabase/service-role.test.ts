import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSupabaseServiceRoleClient } from './service-role';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('createSupabaseServiceRoleClient', () => {
  it('returns null when the service-role key is not configured', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    expect(createSupabaseServiceRoleClient()).toBeNull();
  });

  it('returns null when the Supabase URL is not configured', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
    expect(createSupabaseServiceRoleClient()).toBeNull();
  });

  it('returns a client when both are configured', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
    expect(createSupabaseServiceRoleClient()).not.toBeNull();
  });
});
