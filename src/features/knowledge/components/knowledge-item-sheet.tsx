'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { useAppForm } from '@/lib/form';
import { createKnowledgeItemMutation, updateKnowledgeItemMutation } from '../api/queries';
import type { KnowledgeItem } from '../api/types';
import {
  KNOWLEDGE_ANSWER_MAX_LENGTH,
  KNOWLEDGE_CATEGORY_MAX_LENGTH,
  KNOWLEDGE_QUESTION_MAX_LENGTH,
  knowledgeItemSchema
} from '../schemas/knowledge';
import {
  KNOWLEDGE_LANGUAGE_LABEL,
  isKnowledgeLanguage,
  type KnowledgeLanguage
} from '../utils/language';
import { useKnowledgeUiStore } from '../utils/store';

const ANSWER_FIELD_NAME: Record<KnowledgeLanguage, 'answerEn' | 'answerMe' | 'answerRu'> = {
  en: 'answerEn',
  me: 'answerMe',
  ru: 'answerRu'
};

/** English first (its column is always storable — see schemas/knowledge.ts), then every other supported language, deduped. */
function languagesToShow(supportedLanguages: string[]): KnowledgeLanguage[] {
  const supported = supportedLanguages.filter(isKnowledgeLanguage);
  return Array.from(new Set<KnowledgeLanguage>(['en', ...supported]));
}

function KnowledgeItemForm({
  businessId,
  defaultLanguage,
  supportedLanguages,
  item,
  onSaved,
  onCancel
}: {
  businessId: string;
  defaultLanguage: string;
  supportedLanguages: string[];
  item: KnowledgeItem | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isEditing = item !== null;
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation(createKnowledgeItemMutation(businessId));
  const updateMutation = useMutation(updateKnowledgeItemMutation(businessId));
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const form = useAppForm({
    defaultValues: {
      category: item?.category ?? '',
      question: item?.question ?? '',
      // Every answer field is carried forward from the existing item
      // (never dropped), even for a language whose field isn't
      // rendered below — see languagesToShow(). Submitting the form
      // resubmits this value unchanged, so a hidden unsupported-
      // language answer is never erased.
      answerEn: item?.answerEn ?? '',
      answerMe: item?.answerMe ?? '',
      answerRu: item?.answerRu ?? '',
      isActive: item?.isActive ?? true,
      sortOrder: item?.sortOrder ?? 0
    },
    validators: { onSubmit: knowledgeItemSchema(defaultLanguage) },
    onSubmit: async ({ value }) => {
      setFormError(null);

      const result = isEditing
        ? await updateMutation.mutateAsync({ defaultLanguage, itemId: item.id, ...value })
        : await createMutation.mutateAsync({ defaultLanguage, ...value });

      if (!result.success) {
        setFormError(result.error);
        return;
      }

      toast.success(isEditing ? 'Knowledge item updated.' : 'Knowledge item added.');
      onSaved();
    }
  });

  const shownLanguages = languagesToShow(supportedLanguages);

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.AppField
          name='category'
          children={(field) => (
            <field.TextField
              label='Category'
              required
              maxLength={KNOWLEDGE_CATEGORY_MAX_LENGTH}
              placeholder='e.g. Check-in, Pricing, Amenities'
            />
          )}
        />
        <form.AppField
          name='question'
          children={(field) => (
            <field.TextareaField
              label='Question'
              required
              rows={2}
              maxLength={KNOWLEDGE_QUESTION_MAX_LENGTH}
              showCount
              placeholder='What do guests usually ask?'
            />
          )}
        />

        {shownLanguages.map((lang) => {
          const isDefault = lang === defaultLanguage;
          return (
            <form.AppField
              key={lang}
              name={ANSWER_FIELD_NAME[lang]}
              children={(field) => (
                <field.TextareaField
                  label={`${KNOWLEDGE_LANGUAGE_LABEL[lang]} answer${isDefault ? ' · Default language' : ''}`}
                  required={isDefault}
                  rows={3}
                  maxLength={KNOWLEDGE_ANSWER_MAX_LENGTH}
                  showCount
                  placeholder={
                    isDefault ? 'Required — this is the business default language.' : 'Optional'
                  }
                />
              )}
            />
          );
        })}

        <form.AppField
          name='sortOrder'
          children={(field) => (
            <field.TextField
              label='Sort order'
              type='number'
              min={0}
              step={1}
              description='Lower numbers appear first.'
              required
            />
          )}
        />

        <form.AppField
          name='isActive'
          children={(field) => (
            <field.SwitchField
              label='Active'
              description='Only active items are used in AI receptionist answers.'
            />
          )}
        />

        {formError && (
          <p role='alert' className='text-destructive text-sm'>
            {formError}
          </p>
        )}

        <div className='flex items-center justify-end gap-2 pt-2'>
          <Button type='button' variant='outline' onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <form.AppForm>
            <form.SubmitButton>{isEditing ? 'Save changes' : 'Add item'}</form.SubmitButton>
          </form.AppForm>
        </div>
      </FieldGroup>
    </form>
  );
}

export function KnowledgeItemSheet({
  businessId,
  defaultLanguage,
  supportedLanguages
}: {
  businessId: string;
  defaultLanguage: string;
  supportedLanguages: string[];
}) {
  const sheetOpen = useKnowledgeUiStore((state) => state.sheetOpen);
  const editingItem = useKnowledgeUiStore((state) => state.editingItem);
  const closeSheet = useKnowledgeUiStore((state) => state.closeSheet);

  return (
    <Sheet
      open={sheetOpen}
      onOpenChange={(open) => {
        if (!open) closeSheet();
      }}
    >
      <SheetContent side='right' className='w-full overflow-y-auto p-4 sm:max-w-xl'>
        <SheetHeader className='p-0'>
          <SheetTitle>{editingItem ? 'Edit knowledge item' : 'Add knowledge item'}</SheetTitle>
          <SheetDescription>
            {editingItem
              ? 'Update this question and its answers.'
              : 'Add a new question the AI receptionist can answer from.'}
          </SheetDescription>
        </SheetHeader>
        <div className='mt-4'>
          {sheetOpen && (
            <KnowledgeItemForm
              key={editingItem?.id ?? 'create'}
              businessId={businessId}
              defaultLanguage={defaultLanguage}
              supportedLanguages={supportedLanguages}
              item={editingItem}
              onSaved={closeSheet}
              onCancel={closeSheet}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
