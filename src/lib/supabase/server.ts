import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPublicSupabaseEnv } from '@/lib/supabase/env';

/**
 * Cookie-authenticated Supabase client for Server Components, Route
 * Handlers and Server Actions. Uses the signed-in owner's own session
 * (anon key + session cookies) so every query is subject to Row Level
 * Security — this is how owner-tenant isolation is actually enforced,
 * not by application code filtering. This file imports `next/headers`,
 * which Next.js itself refuses to bundle into a Client Component, so it
 * can never end up in the browser.
 *
 * Returns `null` when Supabase isn't configured.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  const env = getPublicSupabaseEnv();
  if (!env) return null;

  const cookieStore = await cookies();

  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component during render, where cookies
          // are read-only. `proxy.ts` refreshes the session on
          // navigation instead, so this is safe to ignore here.
        }
      }
    }
  });
}
