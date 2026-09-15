'use client';

import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import { useInboxStore } from '../utils/store';
import { ConversationListPanel } from './conversation-list-panel';
import { ActiveConversationPanel } from './active-conversation-panel';
import { CustomerDetailsPanel } from './customer-details-panel';
import { CustomerDetailsSheet } from './customer-details-sheet';

export function InboxView() {
  const conversations = useInboxStore((state) => state.conversations);
  const selectedConversationId = useInboxStore((state) => state.selectedConversationId);
  const mobileView = useInboxStore((state) => state.mobileView);
  const setCustomerSheetOpen = useInboxStore((state) => state.setCustomerSheetOpen);

  const activeConversation = conversations.find((c) => c.id === selectedConversationId);

  return (
    <div className='flex h-[calc(100dvh-5.5rem)] min-h-0 w-full min-w-0 gap-3 overflow-hidden'>
      <ConversationListPanel
        className={cn(
          'min-w-0 w-full md:w-[300px] md:shrink-0 lg:w-[320px]',
          mobileView === 'thread' ? 'hidden md:flex' : 'flex'
        )}
      />

      <div className={cn('min-w-0 flex-1', mobileView === 'list' ? 'hidden md:flex' : 'flex')}>
        {activeConversation ? (
          <ActiveConversationPanel
            conversation={activeConversation}
            className='w-full'
            onOpenCustomerDetails={() => setCustomerSheetOpen(true)}
          />
        ) : (
          <div className='flex h-full w-full items-center justify-center rounded-xl border border-dashed'>
            <Empty>
              <EmptyMedia variant='icon'>
                <Icons.chat aria-hidden='true' />
              </EmptyMedia>
              <EmptyTitle>No conversation selected</EmptyTitle>
              <EmptyDescription>
                Choose a conversation from the list to see it here.
              </EmptyDescription>
            </Empty>
          </div>
        )}
      </div>

      {activeConversation && (
        <CustomerDetailsPanel
          conversation={activeConversation}
          className='w-[300px] shrink-0 lg:w-[320px]'
        />
      )}

      <CustomerDetailsSheet conversation={activeConversation} />
    </div>
  );
}
