'use client';

import { useEffect, useRef, useState } from 'react';
import { Icons } from '@/components/icons';
import type { DemoBusiness, DemoMessage } from '../types';
import { ChatMessage } from './chat-message';

type ChatPanelProps = {
  business: DemoBusiness;
  messages: DemoMessage[];
  pending: boolean;
  leadCaptured: boolean;
  handoffOccurred: boolean;
  onSwitchBusiness: () => void;
  onSend: (text: string) => void;
  onRetry: (id: string) => void;
  onRequestHandoff: (id: string) => void;
  onDismissNoMatch: (id: string) => void;
  onRequestLeadForm: () => void;
  onSubmitLead: (name: string, email: string) => void;
  onDismissLeadForm: () => void;
  onSimulateFailure: () => void;
  onGoToInboxOutcome: () => void;
};

export function ChatPanel({
  business,
  messages,
  pending,
  leadCaptured,
  handoffOccurred,
  onSwitchBusiness,
  onSend,
  onRetry,
  onRequestHandoff,
  onDismissNoMatch,
  onRequestLeadForm,
  onSubmitLead,
  onDismissLeadForm,
  onSimulateFailure,
  onGoToInboxOutcome
}: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages.length, pending]);

  // Chat just opened as a direct result of the visitor's own click — an
  // intentional, expected focus move, not the "steals focus whenever a
  // scripted message appears" case this milestone's a11y rules forbid.
  useEffect(() => {
    composerRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once, on mount only
  }, []);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim() || pending) return;
    onSend(draft);
    setDraft('');
  }

  const [chipEntryA, chipEntryB] = business.chipQuestionIds.map(
    (id) => business.knowledgeBase.find((entry) => entry.id === id)!
  );

  return (
    <div className='rounded-daylight-card shadow-daylight-lg flex max-h-[640px] flex-col overflow-hidden bg-white'>
      <div className='bg-daylight-indigo flex items-center gap-3 px-6 py-4.5'>
        <div className='text-daylight-indigo flex size-8.5 shrink-0 items-center justify-center rounded-[11px] bg-white text-[13px] font-extrabold'>
          {business.initials}
        </div>
        <div className='min-w-0'>
          <p className='truncate text-[15px] font-bold text-white'>{business.name}</p>
          <p className='text-daylight-on-indigo-muted text-xs'>Demo chat · example business</p>
        </div>
        <button
          type='button'
          onClick={onSwitchBusiness}
          className='focus-visible:outline-daylight-on-navy ml-auto shrink-0 rounded-daylight-control text-sm font-bold text-white/90 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2'
        >
          Switch business
        </button>
      </div>

      <div
        ref={logRef}
        role='log'
        aria-live='polite'
        aria-label={`Conversation with ${business.name}`}
        className='flex flex-1 flex-col gap-3.5 overflow-y-auto px-6 py-5'
      >
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            onRetry={onRetry}
            onRequestHandoff={onRequestHandoff}
            onDismissNoMatch={onDismissNoMatch}
            onSubmitLead={onSubmitLead}
            onDismissLeadForm={onDismissLeadForm}
          />
        ))}

        {pending ? (
          <div
            aria-hidden='true'
            className='bg-daylight-surface-muted flex w-fit items-center gap-1.5 rounded-2xl px-4 py-3.5'
          >
            <span className='bg-daylight-focus size-2 animate-bounce rounded-full motion-reduce:animate-none' />
            <span className='bg-daylight-indigo-tint-2 size-2 animate-bounce rounded-full [animation-delay:120ms] motion-reduce:animate-none' />
            <span className='bg-daylight-border size-2 animate-bounce rounded-full [animation-delay:240ms] motion-reduce:animate-none' />
          </div>
        ) : null}
        {pending ? <span className='sr-only'>{business.name} is typing…</span> : null}
      </div>

      {handoffOccurred ? (
        <div className='border-daylight-border flex flex-col items-center gap-2.5 border-t px-6 py-5 text-center'>
          <button
            type='button'
            onClick={onGoToInboxOutcome}
            className='bg-daylight-indigo shadow-daylight-button hover:bg-daylight-indigo-hover focus-visible:outline-daylight-focus rounded-daylight-button min-h-11 px-6.5 text-[15px] font-bold text-white focus-visible:outline-2'
          >
            See what happens next
          </button>
          <span className='text-daylight-muted text-xs'>
            This demo conversation isn&apos;t saved.
          </span>
        </div>
      ) : (
        <>
          <div className='border-daylight-border flex flex-wrap gap-2 border-t px-6 pt-3.5 pb-1'>
            {[chipEntryA, chipEntryB].map((entry) => (
              <button
                key={entry.id}
                type='button'
                disabled={pending}
                onClick={() => onSend(entry.sampleQuestion)}
                className='bg-daylight-indigo-tint text-daylight-indigo focus-visible:outline-daylight-focus rounded-full px-3.5 py-2 text-[13px] font-bold disabled:opacity-50 focus-visible:outline-2'
              >
                {entry.sampleQuestion}
              </button>
            ))}
            <button
              type='button'
              disabled={pending}
              onClick={() => onSend('Talk to a person')}
              className='bg-daylight-indigo-tint text-daylight-indigo focus-visible:outline-daylight-focus rounded-full px-3.5 py-2 text-[13px] font-bold disabled:opacity-50 focus-visible:outline-2'
            >
              Talk to a person
            </button>
            {!leadCaptured ? (
              <button
                type='button'
                disabled={pending}
                onClick={onRequestLeadForm}
                className='bg-daylight-indigo-tint text-daylight-indigo focus-visible:outline-daylight-focus rounded-full px-3.5 py-2 text-[13px] font-bold disabled:opacity-50 focus-visible:outline-2'
              >
                Share my details
              </button>
            ) : null}
          </div>

          <form onSubmit={handleSubmit} className='flex items-center gap-2.5 px-6 pt-2.5 pb-5'>
            <label htmlFor='demo-chat-input' className='sr-only'>
              Message
            </label>
            <input
              ref={composerRef}
              id='demo-chat-input'
              type='text'
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder='Type a message…'
              aria-label='Message'
              className='bg-daylight-surface-muted focus-visible:outline-daylight-focus min-h-11 flex-1 rounded-daylight-control px-4.5 py-3 text-[15px] text-daylight-ink outline-none focus-visible:outline-2'
            />
            <button
              type='submit'
              disabled={!draft.trim() || pending}
              aria-label='Send message'
              className='bg-daylight-indigo hover:bg-daylight-indigo-hover focus-visible:outline-daylight-focus flex min-h-11 min-w-11 items-center justify-center rounded-daylight-control text-white transition-colors disabled:cursor-not-allowed disabled:bg-daylight-indigo-tint-2 disabled:text-daylight-muted focus-visible:outline-2'
            >
              <Icons.send className='size-4.5' aria-hidden='true' />
            </button>
          </form>

          <div className='px-6 pb-4.5'>
            <button
              type='button'
              disabled={pending}
              onClick={onSimulateFailure}
              className='text-daylight-muted hover:text-daylight-ink-soft focus-visible:outline-daylight-focus rounded-daylight-control text-xs font-semibold underline-offset-2 hover:underline disabled:opacity-50 focus-visible:outline-2'
            >
              Simulate a failed message (demo)
            </button>
          </div>
        </>
      )}
    </div>
  );
}
