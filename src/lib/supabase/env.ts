/**
 * Central place that reads Supabase environment variables. Never throws
 * at module load time (that would break the build and any page that
 * renders before Supabase is configured) — callers decide how to react
 * to a missing configuration.
 *
 * ai-receptionist-platform shares one Supabase project with the
 * ChatbotDemo repo (same tables, same Row Level Security policies).
 * This file intentionally mirrors ChatbotDemo's `lib/supabase/env.ts`.
 */

export interface PublicSupabaseEnv {
  url: string;
  anonKey: string;
}

export function getPublicSupabaseEnv(): PublicSupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/** True once the two public Supabase variables are present. */
export function isSupabaseConfigured(): boolean {
  return getPublicSupabaseEnv() !== null;
}

/**
 * A safe, non-sensitive message for developer-facing UI when Supabase
 * isn't configured. Never shown to a real signed-in owner in
 * production — this only appears when the env vars themselves are
 * missing, which a production deploy should never ship without.
 */
export const SUPABASE_MISSING_ENV_MESSAGE =
  "Supabase isn't configured yet. Copy env.example.txt to .env.local and fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY with the values from the shared Supabase project.";
