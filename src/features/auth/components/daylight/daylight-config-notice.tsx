import { DaylightFormMessage } from './daylight-form-message';

/** The Daylight-scoped counterpart to the shared `SupabaseConfigNotice`. */
export function DaylightConfigNotice({ message }: { message: string }) {
  return <DaylightFormMessage variant='error'>{message}</DaylightFormMessage>;
}
