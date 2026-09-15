/**
 * Shared, exact error copy for the two authorization failure modes
 * every knowledge query/action can hit (see `authorize.ts`). Exported
 * from this plain module — not from `authorize.ts` itself, which
 * imports `next/headers` transitively and must never be imported by
 * client code — so the client can match on it precisely instead of
 * guessing from a substring. Mirrors the identical pattern in
 * src/features/inbox/api/types.ts.
 */
export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';
export const NO_BUSINESS_ACCESS_MESSAGE =
  "We couldn't find that business, or you don't have access to it.";
export const ITEM_UNAVAILABLE_ERROR = 'This knowledge item is no longer available.';
export const GENERIC_SAVE_ERROR = 'Something went wrong. Please try again.';
export const GENERIC_LOAD_ERROR = 'We could not load the knowledge base. Please try again.';

/** One row from public.knowledge_items, shaped for the UI. Field names/values are otherwise unchanged from the database — ChatbotDemo reads the same row. */
export type KnowledgeItem = {
  id: string;
  category: string;
  question: string;
  answerEn: string;
  answerMe: string;
  answerRu: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeItemInput = {
  category: string;
  question: string;
  answerEn: string;
  answerMe: string;
  answerRu: string;
  isActive: boolean;
  sortOrder: number;
};

export type KnowledgeItemResult =
  | { success: true; item: KnowledgeItem }
  | { success: false; error: string };

export type KnowledgeActionResult = { success: true } | { success: false; error: string };
