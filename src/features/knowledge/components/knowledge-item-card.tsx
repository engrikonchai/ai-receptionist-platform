'use client';

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toggleKnowledgeItemMutation } from '../api/queries';
import type { KnowledgeItem } from '../api/types';
import { KNOWLEDGE_LANGUAGE_LABEL, type KnowledgeLanguage } from '../utils/language';
import { useKnowledgeUiStore } from '../utils/store';

const LANGUAGE_ANSWER_KEY: Record<KnowledgeLanguage, keyof KnowledgeItem> = {
  en: 'answerEn',
  me: 'answerMe',
  ru: 'answerRu'
};

function AvailableLanguageBadges({ item }: { item: KnowledgeItem }) {
  const present = (Object.keys(LANGUAGE_ANSWER_KEY) as KnowledgeLanguage[]).filter(
    (lang) => String(item[LANGUAGE_ANSWER_KEY[lang]]).trim().length > 0
  );

  if (present.length === 0) {
    return <span className='text-muted-foreground text-xs'>No answers yet</span>;
  }

  return (
    <div className='flex flex-wrap items-center gap-1' aria-label='Available answer languages'>
      {present.map((lang) => (
        <Badge key={lang} variant='outline' title={KNOWLEDGE_LANGUAGE_LABEL[lang]}>
          {lang.toUpperCase()}
        </Badge>
      ))}
    </div>
  );
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

  return (
    <Card className='gap-3 p-4'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='min-w-0 flex-1 space-y-1.5'>
          <div className='flex flex-wrap items-center gap-1.5'>
            <Badge variant='secondary'>{item.category}</Badge>
            {item.isActive ? (
              <Badge variant='outline' className='text-primary border-primary/30 gap-1'>
                <Icons.circleCheck className='size-3' aria-hidden='true' />
                Active
              </Badge>
            ) : (
              <Badge variant='outline' className='text-muted-foreground gap-1'>
                <Icons.circleX className='size-3' aria-hidden='true' />
                Inactive
              </Badge>
            )}
          </div>
          <p className='text-foreground text-sm font-semibold wrap-break-word'>{item.question}</p>
          <div className='flex flex-wrap items-center gap-2'>
            <AvailableLanguageBadges item={item} />
            <span className='text-muted-foreground text-xs'>Order {item.sortOrder}</span>
          </div>
        </div>

        <div className='flex shrink-0 flex-wrap items-center gap-1.5'>
          <Button type='button' variant='outline' size='sm' onClick={() => openEditSheet(item)}>
            <Icons.edit className='size-3.5' aria-hidden='true' />
            Edit
          </Button>
          <Button
            type='button'
            variant='outline'
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
            variant='outline'
            size='sm'
            className='text-destructive hover:text-destructive'
            onClick={() => requestDelete(item)}
          >
            <Icons.trash className='size-3.5' aria-hidden='true' />
            Delete
          </Button>
        </div>
      </div>
    </Card>
  );
}
