import { Icons } from '@/components/icons';
import type { DemoMessage } from '../types';
import { LeadCaptureCard } from './lead-capture-card';

type ChatMessageProps = {
  message: DemoMessage;
  onRetry: (messageId: string) => void;
  onRequestHandoff: (sourceMessageId: string) => void;
  onDismissNoMatch: (messageId: string) => void;
  onSubmitLead: (name: string, email: string) => void;
  onDismissLeadForm: () => void;
};

export function ChatMessage({
  message,
  onRetry,
  onRequestHandoff,
  onDismissNoMatch,
  onSubmitLead,
  onDismissLeadForm
}: ChatMessageProps) {
  if (message.kind === 'visitor') {
    return (
      <div className='flex flex-col items-end gap-1.5'>
        <p
          className={
            message.status === 'failed'
              ? 'border-daylight-danger/40 bg-daylight-indigo-tint text-daylight-ink-soft max-w-[80%] rounded-tl-2xl rounded-tr-2xl rounded-bl-2xl border-1.5 px-4 py-2.5 text-[15px] leading-relaxed'
              : 'bg-daylight-indigo max-w-[80%] rounded-tl-2xl rounded-tr-2xl rounded-bl-2xl px-4 py-2.5 text-[15px] leading-relaxed text-white'
          }
        >
          {message.text}
        </p>
        {message.status === 'failed' ? (
          <div className='flex items-center gap-2.5 text-[13px]'>
            <span className='text-daylight-danger font-bold'>Not sent</span>
            <button
              type='button'
              onClick={() => onRetry(message.id)}
              className='text-daylight-indigo focus-visible:outline-daylight-focus rounded-daylight-control font-bold underline-offset-2 hover:underline focus-visible:outline-2'
            >
              Retry
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  if (message.kind === 'receptionist') {
    return (
      <div className='flex max-w-[80%] flex-col gap-1.5'>
        <p className='bg-daylight-surface-muted text-daylight-ink rounded-tl-2xl rounded-tr-2xl rounded-br-2xl px-4 py-2.5 text-[15px] leading-relaxed'>
          {message.text}
        </p>
        {message.sourceTopic ? (
          <span className='text-daylight-muted text-xs font-semibold'>
            From Knowledge Base · {message.sourceTopic}
          </span>
        ) : null}
      </div>
    );
  }

  if (message.kind === 'no-match-prompt') {
    return (
      <div className='flex max-w-[80%] flex-col gap-2.5'>
        <p className='bg-daylight-surface-muted text-daylight-ink rounded-tl-2xl rounded-tr-2xl rounded-br-2xl px-4 py-2.5 text-[15px] leading-relaxed'>
          {message.text}
        </p>
        {!message.resolved ? (
          <div className='flex flex-wrap gap-2'>
            <button
              type='button'
              onClick={() => onRequestHandoff(message.id)}
              className='bg-daylight-indigo focus-visible:outline-daylight-focus rounded-full px-4 py-2 text-[13px] font-bold text-white focus-visible:outline-2'
            >
              Yes, pass it on
            </button>
            <button
              type='button'
              onClick={() => onDismissNoMatch(message.id)}
              className='bg-daylight-indigo-tint text-daylight-indigo focus-visible:outline-daylight-focus rounded-full px-4 py-2 text-[13px] font-bold focus-visible:outline-2'
            >
              Ask something else
            </button>
          </div>
        ) : (
          <span className='text-daylight-muted text-xs italic'>
            Demo note: in a real account this question would be listed under Unanswered questions,
            so the owner can add an answer.
          </span>
        )}
      </div>
    );
  }

  if (message.kind === 'handoff-banner') {
    return (
      <div className='bg-daylight-danger-tint border-daylight-danger/25 flex items-center gap-3 rounded-2xl border px-4.5 py-3.5'>
        <span
          aria-hidden='true'
          className='bg-daylight-danger flex size-6 shrink-0 items-center justify-center rounded-full text-white'
        >
          <Icons.arrowRight className='size-3.5' />
        </span>
        <p className='text-daylight-danger text-[14px] leading-relaxed'>
          <strong className='font-extrabold'>Handed off.&nbsp;</strong>In a real setup, this
          conversation now waits in the business&apos;s Inbox for a person to reply.
        </p>
      </div>
    );
  }

  if (message.kind === 'lead-form') {
    return <LeadCaptureCard onSubmit={onSubmitLead} onDismiss={onDismissLeadForm} />;
  }

  return (
    <div className='bg-daylight-success-tint border-daylight-success/25 flex flex-wrap items-center gap-2.5 rounded-2xl border px-4.5 py-3'>
      <span
        aria-hidden='true'
        className='bg-daylight-success flex size-5.5 shrink-0 items-center justify-center rounded-full text-white'
      >
        <Icons.check className='size-3.5' />
      </span>
      <p className='text-daylight-success text-[14px]'>
        <strong className='font-extrabold'>Lead captured</strong> · {message.name} · {message.email}
      </p>
    </div>
  );
}
