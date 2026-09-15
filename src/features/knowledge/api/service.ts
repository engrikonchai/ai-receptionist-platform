'use server';

import { revalidatePath } from 'next/cache';
import type { KnowledgeItemRow } from '@/lib/supabase/database.types';
import { knowledgeItemSchema } from '../schemas/knowledge';
import { verifyActiveBusiness } from './authorize';
import { GENERIC_LOAD_ERROR, GENERIC_SAVE_ERROR, ITEM_UNAVAILABLE_ERROR } from './types';
import type { KnowledgeActionResult, KnowledgeItem, KnowledgeItemResult } from './types';

const KNOWLEDGE_PATH = '/dashboard/knowledge';

type KnowledgeItemSelectRow = Pick<
  KnowledgeItemRow,
  | 'id'
  | 'category'
  | 'question'
  | 'answer_en'
  | 'answer_me'
  | 'answer_ru'
  | 'is_active'
  | 'sort_order'
  | 'created_at'
  | 'updated_at'
>;

const KNOWLEDGE_ITEM_SELECT =
  'id, category, question, answer_en, answer_me, answer_ru, is_active, sort_order, created_at, updated_at';

function toKnowledgeItem(row: KnowledgeItemSelectRow): KnowledgeItem {
  return {
    id: row.id,
    category: row.category,
    question: row.question,
    answerEn: row.answer_en,
    answerMe: row.answer_me ?? '',
    answerRu: row.answer_ru ?? '',
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function fetchKnowledgeItems(businessId: string): Promise<KnowledgeItem[]> {
  const verified = await verifyActiveBusiness(businessId);
  if (!verified.ok) throw new Error(verified.error);
  const { supabase, businessId: verifiedId } = verified.ctx;

  const { data, error } = await supabase
    .from('knowledge_items')
    .select(KNOWLEDGE_ITEM_SELECT)
    .eq('business_id', verifiedId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw new Error(GENERIC_LOAD_ERROR);

  return ((data ?? []) as KnowledgeItemSelectRow[]).map(toKnowledgeItem);
}

export type KnowledgeItemFormInput = {
  businessId: string;
  defaultLanguage: string;
  category: string;
  question: string;
  answerEn: string;
  answerMe: string;
  answerRu: string;
  isActive: boolean;
  sortOrder: number;
};

/**
 * Shared validate step for create/update: never trusts `businessId`
 * (verified against the owner's own RLS-scoped list) or `defaultLanguage`
 * (re-derived server-side from that same verified business, not from
 * whatever the browser sent) beyond using it to pick which answer field
 * Zod requires to be non-empty.
 */
async function validateKnowledgeItemInput(input: KnowledgeItemFormInput) {
  const verified = await verifyActiveBusiness(input.businessId);
  if (!verified.ok) return { ok: false as const, error: verified.error };

  const parsed = knowledgeItemSchema(input.defaultLanguage).safeParse({
    category: input.category,
    question: input.question,
    answerEn: input.answerEn,
    answerMe: input.answerMe,
    answerRu: input.answerRu,
    isActive: input.isActive,
    sortOrder: input.sortOrder
  });

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? GENERIC_SAVE_ERROR };
  }

  return { ok: true as const, ctx: verified.ctx, data: parsed.data };
}

export async function createKnowledgeItem(
  input: KnowledgeItemFormInput
): Promise<KnowledgeItemResult> {
  const validated = await validateKnowledgeItemInput(input);
  if (!validated.ok) return { success: false, error: validated.error };
  const { supabase, businessId: verifiedId } = validated.ctx;
  const { data: values } = validated;

  const { data, error } = await supabase
    .from('knowledge_items')
    .insert({
      business_id: verifiedId,
      category: values.category,
      question: values.question,
      answer_en: values.answerEn,
      answer_me: values.answerMe || null,
      answer_ru: values.answerRu || null,
      is_active: values.isActive,
      sort_order: values.sortOrder
    })
    .select(KNOWLEDGE_ITEM_SELECT)
    .single();

  if (error) return { success: false, error: GENERIC_SAVE_ERROR };

  revalidatePath(KNOWLEDGE_PATH);
  return { success: true, item: toKnowledgeItem(data as KnowledgeItemSelectRow) };
}

export async function updateKnowledgeItem(
  input: KnowledgeItemFormInput & { itemId: string }
): Promise<KnowledgeItemResult> {
  const validated = await validateKnowledgeItemInput(input);
  if (!validated.ok) return { success: false, error: validated.error };
  const { supabase, businessId: verifiedId } = validated.ctx;
  const { data: values } = validated;

  const { data, error } = await supabase
    .from('knowledge_items')
    .update({
      category: values.category,
      question: values.question,
      answer_en: values.answerEn,
      answer_me: values.answerMe || null,
      answer_ru: values.answerRu || null,
      is_active: values.isActive,
      sort_order: values.sortOrder
    })
    // Ownership verified before every mutation: this WHERE clause is
    // the actual enforcement — if `itemId` belongs to another
    // business, `business_id` never matches, zero rows are affected,
    // and `.maybeSingle()` returns null below.
    .eq('business_id', verifiedId)
    .eq('id', input.itemId)
    .select(KNOWLEDGE_ITEM_SELECT)
    .maybeSingle();

  if (error) return { success: false, error: GENERIC_SAVE_ERROR };
  if (!data) return { success: false, error: ITEM_UNAVAILABLE_ERROR };

  revalidatePath(KNOWLEDGE_PATH);
  return { success: true, item: toKnowledgeItem(data as KnowledgeItemSelectRow) };
}

export async function toggleKnowledgeItem(
  businessId: string,
  itemId: string,
  isActive: boolean
): Promise<KnowledgeActionResult> {
  const verified = await verifyActiveBusiness(businessId);
  if (!verified.ok) return { success: false, error: verified.error };
  const { supabase, businessId: verifiedId } = verified.ctx;

  const { data, error } = await supabase
    .from('knowledge_items')
    .update({ is_active: isActive })
    .eq('business_id', verifiedId)
    .eq('id', itemId)
    .select('id')
    .maybeSingle();

  if (error) return { success: false, error: GENERIC_SAVE_ERROR };
  if (!data) return { success: false, error: ITEM_UNAVAILABLE_ERROR };

  revalidatePath(KNOWLEDGE_PATH);
  return { success: true };
}

export async function deleteKnowledgeItem(
  businessId: string,
  itemId: string
): Promise<KnowledgeActionResult> {
  const verified = await verifyActiveBusiness(businessId);
  if (!verified.ok) return { success: false, error: verified.error };
  const { supabase, businessId: verifiedId } = verified.ctx;

  const { data, error } = await supabase
    .from('knowledge_items')
    .delete()
    .eq('business_id', verifiedId)
    .eq('id', itemId)
    .select('id')
    .maybeSingle();

  if (error) return { success: false, error: GENERIC_SAVE_ERROR };
  if (!data) return { success: false, error: ITEM_UNAVAILABLE_ERROR };

  revalidatePath(KNOWLEDGE_PATH);
  return { success: true };
}
