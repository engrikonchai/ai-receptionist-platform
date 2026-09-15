'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPublicSupabaseEnv } from '@/lib/supabase/env';

let cached: SupabaseClient | null = null;

/**
 * Browser Supabase client for Client Components (auth forms, the owner
 * menu's sign-out action). Only ever uses the two `NEXT_PUBLIC_*`
 * variables — every query it makes is subject to Row Level Security via
 * the signed-in user's own session. Returns `null` when Supabase isn't
 * configured so callers can show a helpful message instead of crashing.
 */
export function createSupabaseBrowserClient(): SupabaseClient | null {
  const env = getPublicSupabaseEnv();
  if (!env) return null;
  if (!cached) {
    cached = createBrowserClient(env.url, env.anonKey);
  }
  return cached;
}
