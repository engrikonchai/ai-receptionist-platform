'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import {
  createKnowledgeItemMutation,
  knowledgeItemsOptions,
  knowledgeKeys
} from '@/features/knowledge/api/queries';
import { MINIMUM_KNOWLEDGE_ITEMS } from '../utils/setup-progress';

/**
 * The onboarding wizard's Knowledge step — reuses the exact same
 * `knowledge_items` model and API the real Knowledge page
 * (src/features/knowledge) uses (`createKnowledgeItemMutation`,
 * `knowledgeItemsOptions`), never a duplicate table or a separate
 * write path. Every item added here shows up in Knowledge exactly as
 * if it had been added from there.
 *
 * Deliberately a lighter add-form than the full Knowledge sheet's own
 * (Question + Answer only, category auto-set to "General") — task-
 * appropriate for a quick first pass during onboarding; the owner can
 * fully edit, recategorize, or add more from the Knowledge page later.
 */
export function OnboardingKnowledgeStep({
  businessId,
  defaultLanguage,
  onCountChange
}: {
  businessId: string;
  defaultLanguage: string;
  /** Lets the parent wizard gate its own Next/Skip footer on the current count. */
  onCountChange: (count: number) => void;
}) {
  const queryClient = useQueryClient();
  const { data: items = [], isPending } = useQuery(knowledgeItemsOptions(businessId));
  // Explicit, React-context-scoped invalidation rather than relying
  // solely on createKnowledgeItemMutation's own onSuccess (which reads
  // the module-level getQueryClient() singleton) — keeps this list
  // correct regardless of which QueryClient instance is actually
  // rendering this component.
  const createMutation = useMutation({
    ...createKnowledgeItemMutation(businessId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: knowledgeKeys.items(businessId) });
    }
  });

  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const activeItems = items.filter((item) => item.isActive);

  // Report the live count up to the parent wizard so it can gate its
  // own Next/Skip footer — an effect, not a render-time call, since
  // `onCountChange` updates the parent's own state.
  useEffect(() => {
    onCountChange(activeItems.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onCountChange is a fresh closure every render; only the count itself should retrigger this
  }, [activeItems.length]);

  async function handleAdd() {
    setFormError(null);
    const trimmedQuestion = question.trim();
    const trimmedAnswer = answer.trim();
    if (!trimmedQuestion) {
      setFormError('Enter a question.');
      return;
    }
    if (!trimmedAnswer) {
      setFormError('Enter an answer.');
      return;
    }

    const result = await createMutation.mutateAsync({
      defaultLanguage,
      category: 'General',
      question: trimmedQuestion,
      answerEn: defaultLanguage === 'en' ? trimmedAnswer : '',
      answerMe: defaultLanguage === 'me' ? trimmedAnswer : '',
      answerRu: defaultLanguage === 'ru' ? trimmedAnswer : '',
      isActive: true,
      sortOrder: items.length
    });

    if (!result.success) {
      setFormError(result.error);
      return;
    }
    setQuestion('');
    setAnswer('');
  }

  return (
    <div className='space-y-4'>
      <div className='bg-muted/50 rounded-lg border p-3'>
        <p className='text-sm font-medium'>
          {activeItems.length} of {MINIMUM_KNOWLEDGE_ITEMS} suggested added
        </p>
        <p className='text-muted-foreground mt-0.5 text-sm'>
          Add a few common questions your customers ask, and how you&apos;d answer them.
        </p>
      </div>

      {activeItems.length > 0 && (
        <ul className='space-y-2' aria-label='Knowledge items added so far'>
          {activeItems.map((item) => (
            <li key={item.id} className='rounded-lg border p-3'>
              <p className='text-foreground text-sm font-medium wrap-break-word'>{item.question}</p>
              <p className='text-muted-foreground mt-1 text-sm wrap-break-word'>
                {item.answerEn || item.answerMe || item.answerRu}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className='space-y-3 rounded-lg border p-3'>
        <div className='space-y-1.5'>
          <Label htmlFor='onboarding-knowledge-question'>Question</Label>
          <Input
            id='onboarding-knowledge-question'
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value);
              if (formError) setFormError(null);
            }}
            placeholder='e.g. What time is check-in?'
            maxLength={300}
          />
        </div>
        <div className='space-y-1.5'>
          <Label htmlFor='onboarding-knowledge-answer'>Answer</Label>
          <Textarea
            id='onboarding-knowledge-answer'
            value={answer}
            onChange={(e) => {
              setAnswer(e.target.value);
              if (formError) setFormError(null);
            }}
            placeholder='e.g. Check-in is from 3 PM, and check-out is by 11 AM.'
            rows={2}
            maxLength={2000}
          />
        </div>
        {formError && (
          <p role='alert' className='text-destructive text-sm'>
            {formError}
          </p>
        )}
        <Button
          type='button'
          variant='secondary'
          onClick={handleAdd}
          disabled={createMutation.isPending || isPending}
          className='h-11 w-full sm:h-9 sm:w-auto'
        >
          {createMutation.isPending ? (
            <Spinner className='size-4' />
          ) : (
            <Icons.add className='size-4' aria-hidden='true' />
          )}
          Add question
        </Button>
      </div>
    </div>
  );
}
