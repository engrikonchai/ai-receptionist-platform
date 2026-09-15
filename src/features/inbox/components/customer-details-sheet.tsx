'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useInboxStore } from '../utils/store';
import type { Conversation } from '../utils/types';
import { CustomerDetailsContent } from './customer-details-panel';

export function CustomerDetailsSheet({ conversation }: { conversation: Conversation | undefined }) {
  const open = useInboxStore((state) => state.customerSheetOpen);
  const setOpen = useInboxStore((state) => state.setCustomerSheetOpen);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side='right' className='w-full overflow-y-auto p-4 sm:max-w-sm'>
        <SheetHeader className='p-0'>
          <SheetTitle>Customer details</SheetTitle>
        </SheetHeader>
        {conversation && <CustomerDetailsContent conversation={conversation} />}
      </SheetContent>
    </Sheet>
  );
}
