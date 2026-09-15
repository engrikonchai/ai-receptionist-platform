'use client';

import { FormEvent } from 'react';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Conversation } from '../utils/types';

export function Composer({
  conversation,
  draft,
  onDraftChange,
  onSend,
  onSuggestedReply
}: {
  conversation: Conversation;
  draft: string;
  onDraftChange: (text: string) => void;
  onSend: () => void;
  onSuggestedReply: (text: string) => void;
}) {
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSend();
  };

  return (
    <div className='bg-card sticky bottom-0 border-t p-3'>
      {conversation.suggestedReplies.length > 0 && (
        <div className='mb-2 flex flex-wrap gap-1.5' aria-label='Suggested replies'>
          {conversation.suggestedReplies.map((reply, index) => (
            <button
              key={index}
              type='button'
              onClick={() => onSuggestedReply(reply)}
              className='border-border text-muted-foreground hover:border-primary/40 hover:text-foreground focus-visible:ring-ring focus-visible:ring-offset-background max-w-full truncate rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'
              title={reply}
            >
              {reply}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} aria-label='Reply composer' className='flex items-end gap-2'>
        <label htmlFor='inbox-composer' className='sr-only'>
          Write a reply to {conversation.customer.name}
        </label>
        <Textarea
          id='inbox-composer'
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (draft.trim()) {
                e.currentTarget.closest('form')?.requestSubmit();
              }
            }
          }}
          placeholder={`Message ${conversation.customer.name} (Enter to send, Shift+Enter for a new line)`}
          rows={2}
          className='max-h-32 min-h-[3rem] flex-1 resize-none'
        />
        <div className='flex shrink-0 items-center gap-1.5'>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  disabled
                  aria-label='Attach a file'
                />
              }
            >
              <Icons.paperclip className='size-4' />
            </TooltipTrigger>
            <TooltipContent>Attachments are coming in a future update</TooltipContent>
          </Tooltip>
          <Button type='submit' size='icon' disabled={!draft.trim()} aria-label='Send message'>
            <Icons.send className='size-4' aria-hidden='true' />
          </Button>
        </div>
      </form>
    </div>
  );
}
