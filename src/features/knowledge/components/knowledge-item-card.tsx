'use client';

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status-pill';
import { cn } from '@/lib/utils';
import { toggleKnowledgeItemMutation } from '../api/queries';
import type { KnowledgeItem } from '../api/types';
import { KNOWLEDGE_LANGUAGE_LABEL, type KnowledgeLanguage } from '../utils/language';
import { useKnowledgeUiStore } from '../utils/store';

const LANGUAGE_ANSWER_KEY: Record<KnowledgeLanguage, keyof KnowledgeItem> = {
  en: 'answerEn',
  me: 'answerMe',
  ru: 'answerRu'
};

function AvailableLanguages({ item }: { item: KnowledgeItem }) {
  const present = (Object.keys(LANGUAGE_ANSWER_KEY) as KnowledgeLanguage[]).filter(
    (lang) => String(item[LANGUAGE_ANSWER_KEY[lang]]).trim().length > 0
  );

  if (present.length === 0) {
    return <span className='text-status-attention text-xs font-bold'>No answers yet</span>;
  }

  return (
    <div className='flex flex-wrap items-center gap-1' aria-label='Available answer languages'>
      {present.map((lang) => (
        <span
          key={lang}
          title={KNOWLEDGE_LANGUAGE_LABEL[lang]}
          className='bg-secondary text-secondary-foreground rounded-md px-1.5 py-0.5 text-[11px] font-bold'
        >
          {lang.toUpperCase()}
        </span>
      ))}
    </div>
  );
}

/** The answer the assistant will actually give — the first non-empty language, default English. */
function answerPreview(item: KnowledgeItem): string {
  return [item.answerEn, item.answerMe, item.answerRu].find((a) => a.trim().length > 0) ?? '';
}

export function KnowledgeItemCard({
  businessId,
  item
}: {
  businessId: string;
  item: KnowledgeItem;
}) {
  const openEditSheet = useKnowledgeUiStore((state) => state.openEditSheet);
  const requestDelete = useKnowledgeUiStore((state) => state.requestDelete);

  const toggleMutation = useMutation(toggleKnowledgeItemMutation(businessId));

  function handleToggle() {
    toggleMutation.mutate(
      { itemId: item.id, isActive: !item.isActive },
      {
        onSuccess: (result) => {
          if (result.success) {
            toast.success(item.isActive ? 'Item deactivated.' : 'Item activated.');
          } else {
            toast.error(result.error);
          }
        },
        onError: () => toast.error('Something went wrong. Please try again.')
      }
    );
  }

  const answer = answerPreview(item);

  return (
    <article
      className={cn(
        'bg-card ring-foreground/10 flex flex-col gap-3 rounded-2xl p-4 ring-1 sm:p-5',
        !item.isActive && 'bg-card/60'
      )}
    >
      <div className='flex flex-wrap items-center gap-2'>
        <span className='bg-accent text-accent-foreground rounded-md px-2 py-0.5 text-[11px] font-extrabold tracking-wide uppercase'>
          {item.category}
        </span>
        {item.isActive ? (
          <StatusPill tone='success' dot>
            Active
          </StatusPill>
        ) : (
          <StatusPill tone='neutral'>
            <Icons.circleX className='size-3' aria-hidden='true' />
            Inactive
          </StatusPill>
        )}
      </div>

      <div className='min-w-0 space-y-1'>
        <h2
          className={cn(
            'text-[15px] leading-snug font-bold wrap-break-word',
            item.isActive ? 'text-foreground' : 'text-muted-foreground'
          )}
        >
          {item.question}
        </h2>
        {answer && (
          <p className='text-muted-foreground line-clamp-2 text-sm leading-relaxed'>{answer}</p>
        )}
      </div>

      <div className='flex flex-wrap items-center justify-between gap-x-4 gap-y-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <AvailableLanguages item={item} />
          <span className='text-muted-foreground text-xs'>Order {item.sortOrder}</span>
        </div>

        <div className='-mr-2 flex shrink-0 flex-wrap items-center gap-1'>
          <Button type='button' variant='ghost' size='sm' onClick={() => openEditSheet(item)}>
            <Icons.edit className='size-3.5' aria-hidden='true' />
            Edit
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            disabled={toggleMutation.isPending}
            onClick={handleToggle}
          >
            {item.isActive ? (
              <Icons.circleX className='size-3.5' aria-hidden='true' />
            ) : (
              <Icons.circleCheck className='size-3.5' aria-hidden='true' />
            )}
            {item.isActive ? 'Deactivate' : 'Activate'}
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='text-destructive hover:text-destructive'
            onClick={() => requestDelete(item)}
          >
            <Icons.trash className='size-3.5' aria-hidden='true' />
            Delete
          </Button>
        </div>
      </div>
    </article>
  );
}
