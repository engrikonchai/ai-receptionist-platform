import type { Channel, ConversationStatus, HandledBy, LanguageCode, LeadStatus } from './types';

export const CHANNEL_LABEL: Record<Channel, string> = {
  website: 'Website',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp'
};

export const CHANNEL_ICON = {
  website: 'website',
  instagram: 'instagram',
  whatsapp: 'whatsapp'
} as const;

export const LANGUAGE_LABEL: Record<LanguageCode, string> = {
  en: 'English',
  me: 'Montenegrin (Latin)',
  ru: 'Русский'
};

export const STATUS_LABEL: Record<ConversationStatus, string> = {
  open: 'Open',
  needs_attention: 'Needs attention',
  resolved: 'Resolved'
};

export const HANDLED_BY_LABEL: Record<HandledBy, string> = {
  ai: 'AI Agent',
  human: 'Human Operator'
};

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New',
  qualified: 'Qualified',
  negotiating: 'Negotiating',
  lost: 'Lost',
  won: 'Won'
};

export function nowTimestamp() {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
