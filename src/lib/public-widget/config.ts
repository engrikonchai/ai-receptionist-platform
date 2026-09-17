import { createSupabasePublicClient } from '@/lib/supabase/public';
import type { WidgetPublicConfigRpcResult } from '@/lib/supabase/database.types';
import { normalizeOrigin } from './origin';

/**
 * Loads the one safe, narrow row the public widget's cosmetic-config
 * endpoint needs — via the anon key, calling
 * `public.resolve_widget_config(p_widget_id, p_origin)` (see
 * supabase/migrations/20260916120000_widget_allowed_origins.sql).
 * Never the service-role key, never a table/view read anon could query
 * unfiltered — a SECURITY DEFINER function that requires both a widget
 * id AND the caller's own exact, allow-listed origin as arguments has no
 * "list everything" equivalent.
 *
 * Returns `null` for anything that isn't "a real widget, active
 * business, enabled widget, and exactly this origin allow-listed" — the
 * function's own WHERE clause already collapses "unknown id",
 * "disabled", and "wrong origin" into the same empty result, so a
 * caller here can't distinguish them either. `originHeader` must be the
 * request's real `Origin` header, normalized the same way it's stored
 * (see src/lib/public-widget/origin.ts) — an origin that fails to
 * normalize never reaches the database at all.
 */
export async function fetchWidgetPublicConfig(
  publicWidgetId: string,
  originHeader: string | null
): Promise<WidgetPublicConfigRpcResult | null> {
  const normalizedOrigin = originHeader ? normalizeOrigin(originHeader) : null;
  if (!normalizedOrigin) return null;

  // Same reasoning as checkRateLimit()'s try/catch (see
  // src/lib/public-widget/rate-limit.ts): client construction and the
  // RPC call are expected to fail via a returned `{ error }`, never by
  // throwing, but a malformed env var or a genuine network failure can
  // do exactly that. Left uncaught, that becomes an uncaught exception
  // out of this route — a bare framework 500 with no CORS headers,
  // instead of this function's documented "null for anything that
  // isn't a real, allowed widget" contract turning into the route's
  // normal `{ enabled: false }` 200 response.
  try {
    const supabase = createSupabasePublicClient();
    if (!supabase) {
      console.error(
        '[public-widget] config lookup unavailable: public Supabase client could not be created (check NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)'
      );
      return null;
    }

    const { data, error } = await supabase
      .rpc('resolve_widget_config', {
        p_widget_id: publicWidgetId,
        p_origin: normalizedOrigin
      })
      .maybeSingle();

    if (error || !data) {
      if (error) {
        console.error('[public-widget] resolve_widget_config RPC failed', error.message);
      }
      return null;
    }
    return data as WidgetPublicConfigRpcResult;
  } catch (caught) {
    console.error(
      '[public-widget] config lookup unavailable: unexpected exception',
      caught instanceof Error ? caught.message : caught
    );
    return null;
  }
}
