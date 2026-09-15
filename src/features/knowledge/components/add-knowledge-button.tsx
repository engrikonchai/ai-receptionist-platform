'use client';

import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useKnowledgeUiStore } from '../utils/store';

/** Rendered via PageContainer's `pageHeaderAction` slot from the (Server Component) page. */
export function AddKnowledgeButton() {
  const openCreateSheet = useKnowledgeUiStore((state) => state.openCreateSheet);

  return (
    <Button type='button' onClick={openCreateSheet}>
      <Icons.add className='size-4' aria-hidden='true' />
      Add knowledge
    </Button>
  );
}
