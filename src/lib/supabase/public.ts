import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPublicSupabaseEnv } from '@/lib/supabase/env';

/**
 * A plain, unauthenticated Supabase client using only the anon key — no
 * cookies, no session, and never the service-role key. This is what the
 * public widget/chat proxy (src/app/api/public-widget/*) uses to read
 * `public.widget_public_config` (see
 * supabase/migrations/20260916120000_widget_allowed_origins.sql), the
 * one view granted to the `anon` role. It has no access to anything
 * else — every other table stays exactly as owner-only as the rest of
 * this app's RLS design.
 *
 * Returns `null` when Supabase isn't configured, same convention as
 * `createSupabaseServerClient()`/`createSupabaseBrowserClient()`.
 */
export function createSupabasePublicClient(): SupabaseClient | null {
  const env = getPublicSupabaseEnv();
  if (!env) return null;
  return createClient(env.url, env.anonKey);
}
