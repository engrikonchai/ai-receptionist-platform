import type { ConversationChannel } from '@/lib/supabase/database.types';
import { CHANNEL_LABEL } from './format';

/**
 * Never renders a visitor id in full. Keeps just enough of it (first 2,
 * last 4 characters) to tell two conversations apart at a glance — never
 * enough to be usable as an identifier outside this app. Anything short
 * enough that partial masking wouldn't hide much is masked completely
 * instead.
 */
export function maskVisitorId(visitorId: string): string {
  const trimmed = visitorId.trim();
  if (trimmed.length <= 6) return '••••';
  return `${trimmed.slice(0, 2)}••••${trimmed.slice(-4)}`;
}

/** Shown instead of a customer name when no lead has been captured yet. */
export function neutralVisitorName(channel: ConversationChannel, visitorId: string): string {
  return `${CHANNEL_LABEL[channel]} visitor ${maskVisitorId(visitorId)}`;
}
