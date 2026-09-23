import { Icons } from '@/components/icons';
import { MarketingButton } from '@/features/marketing/components/marketing-button';
import type { DemoBusiness } from '../types';

type HandoffOutcomeProps = {
  business: DemoBusiness;
  lastVisitorQuestion: string;
  answeredTopics: string[];
  lead: { name: string; email: string } | null;
  messageCount: number;
  onTryAnotherBusiness: () => void;
};

/**
 * The "what the owner would see" summary screen (Handoff.dc.html /
 * Demo States.dc.html state 05) — a representation of the outcome,
 * never a claim that this demo conversation was actually saved to a
 * real Inbox.
 */
export function HandoffOutcome({
  business,
  lastVisitorQuestion,
  answeredTopics,
  lead,
  messageCount,
  onTryAnotherBusiness
}: HandoffOutcomeProps) {
  const initials = lead
    ? lead.name
        .split(' ')
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : business.initials;

  return (
    <div className='rounded-daylight-card shadow-daylight-lg bg-white p-7 sm:p-9'>
      <div className='bg-daylight-danger-tint border-daylight-danger/25 flex items-center gap-3 rounded-2xl border px-4.5 py-3.5'>
        <span
          aria-hidden='true'
          className='bg-daylight-danger flex size-6 shrink-0 items-center justify-center rounded-full text-white'
        >
          <Icons.arrowRight className='size-3.5' />
        </span>
        <p className='text-daylight-danger text-[15px] leading-relaxed'>
          <strong className='font-extrabold'>Handed off.&nbsp;</strong>In a real setup, this
          conversation now waits in the business&apos;s Inbox for a person to reply.
        </p>
      </div>

      <div className='mt-4.5 grid gap-3.5 sm:grid-cols-2'>
        <div className='bg-daylight-surface-muted rounded-daylight-card-sm p-6'>
          <p className='text-daylight-muted text-xs font-bold tracking-[0.12em] uppercase'>
            What the visitor asked
          </p>
          <p className='font-daylight-serif text-daylight-ink mt-2.5 text-base leading-relaxed'>
            &ldquo;{lastVisitorQuestion}&rdquo;
          </p>
        </div>
        <div className='bg-daylight-surface-muted rounded-daylight-card-sm p-6'>
          <p className='text-daylight-muted text-xs font-bold tracking-[0.12em] uppercase'>
            What the receptionist did
          </p>
          <div className='mt-2.5 flex flex-col gap-2 text-[14px] text-daylight-ink-soft'>
            {answeredTopics.map((topic) => (
              <div key={topic} className='flex items-start gap-2.5'>
                <Icons.check
                  className='text-daylight-success mt-0.5 size-4 shrink-0'
                  aria-hidden='true'
                />
                Answered from {topic}
              </div>
            ))}
            {lead ? (
              <div className='flex items-start gap-2.5'>
                <Icons.check
                  className='text-daylight-success mt-0.5 size-4 shrink-0'
                  aria-hidden='true'
                />
                Captured name and email
              </div>
            ) : null}
            <div className='flex items-start gap-2.5'>
              <Icons.check
                className='text-daylight-success mt-0.5 size-4 shrink-0'
                aria-hidden='true'
              />
              Handed off when asked for a person
            </div>
          </div>
        </div>
      </div>

      <div className='border-daylight-border mt-3.5 flex flex-wrap items-center gap-3 rounded-daylight-card-sm border px-5.5 py-4.5'>
        <div className='bg-daylight-indigo-tint text-daylight-indigo flex size-9 shrink-0 items-center justify-center rounded-[12px] text-[13px] font-extrabold'>
          {initials}
        </div>
        <div>
          <p className='text-daylight-ink text-[15px] font-bold'>
            {lead ? lead.name : 'Website visitor'}
          </p>
          <p className='text-daylight-ink-soft text-[13px]'>
            Inbox preview · {messageCount} messages
          </p>
        </div>
        <div className='ml-auto flex flex-wrap gap-1.5'>
          {lead ? (
            <span className='bg-daylight-success-tint text-daylight-success rounded-full px-3 py-1.5 text-xs font-bold'>
              Lead captured
            </span>
          ) : null}
          <span className='bg-daylight-danger-tint text-daylight-danger rounded-full px-3 py-1.5 text-xs font-bold'>
            Handed off
          </span>
        </div>
      </div>

      <div className='mt-6 flex flex-wrap items-center gap-3.5'>
        <MarketingButton href='/signup'>Get started</MarketingButton>
        <button
          type='button'
          onClick={onTryAnotherBusiness}
          className='text-daylight-ink-soft hover:text-daylight-ink focus-visible:outline-daylight-focus rounded-daylight-button px-4 py-3.5 text-[15px] font-bold focus-visible:outline-2'
        >
          Try another business
        </button>
        <span className='text-daylight-muted ml-auto text-[13px]'>
          Demo conversation isn&apos;t saved.
        </span>
      </div>
    </div>
  );
}
