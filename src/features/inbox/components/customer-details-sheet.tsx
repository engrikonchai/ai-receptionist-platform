'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useInboxStore } from '../utils/store';
import type { ConversationListItem } from '../api/types';
import { CustomerDetailsContent } from './customer-details-panel';

export function CustomerDetailsSheet({
  businessId,
  conversation
}: {
  businessId: string;
  conversation: ConversationListItem | undefined;
}) {
  const open = useInboxStore((state) => state.customerSheetOpen);
  const setOpen = useInboxStore((state) => state.setCustomerSheetOpen);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side='right' className='w-full overflow-y-auto p-4 sm:max-w-sm'>
        <SheetHeader className='p-0'>
          <SheetTitle>Customer details</SheetTitle>
        </SheetHeader>
        {conversation && (
          <CustomerDetailsContent businessId={businessId} conversation={conversation} />
        )}
      </SheetContent>
    </Sheet>
  );
}
