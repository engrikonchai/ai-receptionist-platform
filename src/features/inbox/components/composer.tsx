'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { sendHumanReplyMutation } from '../api/queries';
import { MESSAGE_MAX_LENGTH } from '../schemas/send-human-reply';

/** A UUID even in browsers without `crypto.randomUUID` — still a valid v4 shape for the server's Zod check and the DB's uuid column. */
function createClientMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function Composer({
  businessId,
  conversationId,
  conversationName,
  canSend,
  disabledReason,
  focusSignal
}: {
  businessId: string;
  conversationId: string;
  conversationName: string;
  /** True only when the conversation is taken over by a human and not closed. */
  canSend: boolean;
  /** Shown instead of the input when `canSend` is false. */
  disabledReason: string;
  /** Bumped by the parent right after a successful "Take over" — focuses the composer once. */
  focusSignal: number;
}) {
  const [draft, setDraft] = useState('');
  const [clientMessageId, setClientMessageId] = useState(createClientMessageId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const sendMutation = useMutation(sendHumanReplyMutation(businessId));

  useEffect(() => {
    if (focusSignal > 0) textareaRef.current?.focus();
  }, [focusSignal]);

  useEffect(() => {
    // A fresh draft, client-message id and mutation state per
    // conversation — composing in one thread must never leak into
    // another after switching.
    setDraft('');
    setClientMessageId(createClientMessageId());
    sendMutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the conversation changes, not on every sendMutation identity change
  }, [conversationId]);

  const trimmed = draft.trim();
  const isValid = trimmed.length > 0 && trimmed.length <= MESSAGE_MAX_LENGTH;
  const isSending = sendMutation.isPending;

  function handleSend() {
    if (!isValid || isSending) return;
    sendMutation.mutate(
      { conversationId, content: trimmed, clientMessageId },
      {
        onSuccess: (result) => {
          if (!result.success) return;
          // Only clear on real success — a failed send deliberately
          // leaves the draft in place so nothing typed is lost.
          setDraft('');
          setClientMessageId(createClientMessageId());
        }
      }
    );
  }

  if (!canSend) {
    return (
      <div className='bg-card sticky bottom-0 border-t p-3'>
        <div
          role='status'
          className='bg-muted/50 text-muted-foreground flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs'
        >
          <Icons.lock className='size-3.5 shrink-0' aria-hidden='true' />
          {disabledReason}
        </div>
      </div>
    );
  }

  const sendError =
    sendMutation.data && !sendMutation.data.success
      ? sendMutation.data.error
      : sendMutation.isError
        ? 'Something went wrong sending your message. Please try again.'
        : null;

  return (
    <div className='bg-card sticky bottom-0 border-t p-3'>
      {sendError && (
        <p role='alert' className='text-destructive mb-2 text-xs'>
          {sendError}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        aria-label='Reply composer'
        className='flex items-end gap-2'
      >
        <label htmlFor='inbox-composer' className='sr-only'>
          Message {conversationName}
        </label>
        <Textarea
          id='inbox-composer'
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={`Message ${conversationName} (Enter to send, Shift+Enter for a new line)`}
          rows={2}
          maxLength={MESSAGE_MAX_LENGTH}
          disabled={isSending}
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
          <Button
            type='submit'
            size='icon'
            disabled={!isValid || isSending}
            aria-label='Send message'
          >
            {isSending ? (
              <Spinner className='size-4' />
            ) : (
              <Icons.send className='size-4' aria-hidden='true' />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
