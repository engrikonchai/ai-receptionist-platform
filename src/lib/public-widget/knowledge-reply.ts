import type { SupabaseClient } from '@supabase/supabase-js';
import type { KnowledgeItemRow } from '@/lib/supabase/database.types';

/**
 * A deliberately simple FAQ-matching reply engine — V1 scope for the
 * in-platform public widget runtime.
 *
 * ChatbotDemo's own mock chat engine (lib/chat/knowledge.ts) answers
 * every business from one hardcoded APARTMENT_INFO/FAQ_ANSWERS object,
 * confirmed by direct code reading: a second tenant's visitors would
 * get the first tenant's facts. Rewriting that engine to be driven by
 * each business's own `knowledge_items` is explicitly listed as
 * unfinished work in ChatbotDemo's own ROADMAP.md ("Phase 3"), and is a
 * larger undertaking than this task's actual scope (tenant isolation,
 * config security, settings correctness, abuse protection,
 * installation, testing — not conversational sophistication).
 *
 * This engine instead does keyword/substring matching against each
 * resolved business's own active `knowledge_items` rows — always scoped
 * to the caller-resolved `businessId`, never any other business's data.
 * It does not attempt intent detection, booking flows, or hand-off
 * flows; a visitor who wants a person can still use the existing
 * `human_handoff_enabled` setting (see runtime.ts).
 */

type ScoredItem = { item: KnowledgeItemRow; score: number };

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'do',
  'does',
  'did',
  'can',
  'could',
  'would',
  'should',
  'will',
  'to',
  'of',
  'in',
  'on',
  'for',
  'and',
  'or',
  'what',
  'how',
  'when',
  'where',
  'i',
  'you',
  'my',
  'your',
  'it',
  'that',
  'this',
  'please',
  'hi',
  'hello'
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function answerFor(item: KnowledgeItemRow, language: string): string {
  if (language === 'me' && item.answer_me) return item.answer_me;
  if (language === 'ru' && item.answer_ru) return item.answer_ru;
  return item.answer_en;
}

const FALLBACK_REPLY: Record<string, string> = {
  en: "Thanks for your message! I don't have an answer for that yet — feel free to ask something else, or request to speak with a person.",
  me: 'Hvala na poruci! Trenutno nemam odgovor na to — slobodno postavite drugo pitanje ili zatražite razgovor sa osobom.',
  ru: 'Спасибо за сообщение! У меня пока нет ответа на этот вопрос — задайте другой вопрос или попросите связать вас с человеком.'
};

export function fallbackReply(language: string): string {
  return FALLBACK_REPLY[language] ?? FALLBACK_REPLY.en;
}

/**
 * Loads `businessId`'s own active knowledge items (via the caller's
 * already-scoped client — the service-role client in runtime.ts, always
 * filtered by the server-resolved business id, never a browser-supplied
 * one) and returns the best keyword-overlap match's answer in
 * `language`, or the localized fallback reply if nothing scores above
 * zero.
 */
export async function generateKnowledgeReply(
  supabase: SupabaseClient,
  businessId: string,
  message: string,
  language: string
): Promise<string> {
  const { data, error } = await supabase
    .from('knowledge_items')
    .select(
      'id, business_id, category, question, answer_en, answer_me, answer_ru, is_active, sort_order, created_at, updated_at'
    )
    .eq('business_id', businessId)
    .eq('is_active', true);

  if (error || !data || data.length === 0) return fallbackReply(language);

  const messageTokens = new Set(tokenize(message));
  if (messageTokens.size === 0) return fallbackReply(language);

  const scored: ScoredItem[] = (data as KnowledgeItemRow[]).map((item) => {
    const itemTokens = tokenize(`${item.category} ${item.question}`);
    const score = itemTokens.filter((token) => messageTokens.has(token)).length;
    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score === 0) return fallbackReply(language);

  return answerFor(best.item, language);
}
