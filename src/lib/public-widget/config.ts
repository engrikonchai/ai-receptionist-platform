import { createSupabasePublicClient } from '@/lib/supabase/public';
import type { WidgetPublicConfigRow } from '@/lib/supabase/database.types';

/**
 * Loads the one safe, narrow row the public widget/chat proxy needs to
 * validate a request — via the anon key only, through
 * `public.widget_public_config` (see
 * supabase/migrations/20260916120000_widget_allowed_origins.sql). Never
 * the service-role key, never a wider table read. Returns `null` for
 * anything that isn't a real widget id — callers turn that into the
 * same generic response ChatbotDemo's own widget-service.ts uses, so a
 * caller can't distinguish "wrong id" from "disabled business".
 */
export async function fetchWidgetPublicConfig(
  publicWidgetId: string
): Promise<WidgetPublicConfigRow | null> {
  const supabase = createSupabasePublicClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('widget_public_config')
    .select(
      'public_widget_id, business_active, supported_languages, default_language, title, welcome_message_en, welcome_message_me, welcome_message_ru, primary_color, position, widget_enabled, human_handoff_enabled, allowed_origins'
    )
    .eq('public_widget_id', publicWidgetId)
    .maybeSingle();

  if (error || !data) return null;
  return data as WidgetPublicConfigRow;
}
