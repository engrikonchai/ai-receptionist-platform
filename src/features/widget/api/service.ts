'use server';

import { revalidatePath } from 'next/cache';
import type { BusinessRow, WidgetSettingsRow } from '@/lib/supabase/database.types';
import { widgetSettingsSchema } from '../schemas/widget';
import { verifyActiveBusiness } from './authorize';
import { GENERIC_LOAD_ERROR, GENERIC_SAVE_ERROR } from './types';
import type { WidgetActionResult, WidgetSettings, WidgetSettingsInput } from './types';

const WIDGET_PATH = '/dashboard/widget';

const BUSINESS_SELECT = 'public_widget_id, supported_languages, default_language, handoff_email';
const WIDGET_SELECT =
  'title, welcome_message_en, welcome_message_me, welcome_message_ru, primary_color, position, widget_enabled, human_handoff_enabled, allowed_origins';

type BusinessSelectRow = Pick<
  BusinessRow,
  'public_widget_id' | 'supported_languages' | 'default_language' | 'handoff_email'
>;
type WidgetSelectRow = Pick<
  WidgetSettingsRow,
  | 'title'
  | 'welcome_message_en'
  | 'welcome_message_me'
  | 'welcome_message_ru'
  | 'primary_color'
  | 'position'
  | 'widget_enabled'
  | 'human_handoff_enabled'
  | 'allowed_origins'
>;

function toWidgetSettings(business: BusinessSelectRow, widget: WidgetSelectRow): WidgetSettings {
  return {
    publicWidgetId: business.public_widget_id,
    enabled: widget.widget_enabled,
    assistantName: widget.title,
    welcomeMessageEn: widget.welcome_message_en ?? '',
    welcomeMessageMe: widget.welcome_message_me ?? '',
    welcomeMessageRu: widget.welcome_message_ru ?? '',
    primaryColor: widget.primary_color,
    position: widget.position,
    supportedLanguages: business.supported_languages,
    humanHandoffEnabled: widget.human_handoff_enabled,
    handoffEmail: business.handoff_email ?? '',
    allowedOrigins: widget.allowed_origins
  };
}

/** Also returns `defaultLanguage`, needed by the form to know which welcome-message field is required — never sent back to the client as editable. */
export async function fetchWidgetSettings(
  businessId: string
): Promise<{ settings: WidgetSettings; defaultLanguage: string }> {
  const verified = await verifyActiveBusiness(businessId);
  if (!verified.ok) throw new Error(verified.error);
  const { supabase, businessId: verifiedId } = verified.ctx;

  const [{ data: business, error: businessError }, { data: widget, error: widgetError }] =
    await Promise.all([
      supabase.from('businesses').select(BUSINESS_SELECT).eq('id', verifiedId).maybeSingle(),
      supabase
        .from('widget_settings')
        .select(WIDGET_SELECT)
        .eq('business_id', verifiedId)
        .maybeSingle()
    ]);

  if (businessError || widgetError || !business || !widget) {
    throw new Error(GENERIC_LOAD_ERROR);
  }

  return {
    settings: toWidgetSettings(business as BusinessSelectRow, widget as WidgetSelectRow),
    defaultLanguage: (business as BusinessSelectRow).default_language
  };
}

/**
 * Saves the widget form in a fixed order — businesses, then
 * widget_settings — and stops at the first failure, mirroring
 * src/features/onboarding/actions/complete-onboarding.ts's own
 * two-table update pattern. `businessId` is never accepted from the
 * form's own values (it's the verified id, threaded in separately by
 * the caller — see queries.ts), and this never touches `businesses.id`,
 * `slug`, `public_widget_id`, or `owner_id`.
 */
export async function saveWidgetSettings(
  businessId: string,
  defaultLanguage: string,
  input: WidgetSettingsInput
): Promise<WidgetActionResult> {
  const verified = await verifyActiveBusiness(businessId);
  if (!verified.ok) return { success: false, error: verified.error };
  const { supabase, businessId: verifiedId } = verified.ctx;

  const parsed = widgetSettingsSchema(defaultLanguage).safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? GENERIC_SAVE_ERROR };
  }
  const value = parsed.data;

  const { error: businessUpdateError } = await supabase
    .from('businesses')
    .update({
      supported_languages: value.supportedLanguages,
      handoff_email: value.handoffEmail || null
    })
    .eq('id', verifiedId);

  if (businessUpdateError) return { success: false, error: GENERIC_SAVE_ERROR };

  const { error: widgetUpdateError } = await supabase
    .from('widget_settings')
    .update({
      title: value.assistantName,
      welcome_message_en: value.welcomeMessageEn,
      welcome_message_me: value.welcomeMessageMe,
      welcome_message_ru: value.welcomeMessageRu,
      primary_color: value.primaryColor,
      position: value.position,
      widget_enabled: value.enabled,
      human_handoff_enabled: value.humanHandoffEnabled,
      allowed_origins: value.allowedOrigins
    })
    .eq('business_id', verifiedId);

  if (widgetUpdateError) return { success: false, error: GENERIC_SAVE_ERROR };

  revalidatePath(WIDGET_PATH);
  return { success: true };
}
