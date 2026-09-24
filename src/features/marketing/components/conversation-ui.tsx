import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';

/**
 * Static, fictional product fragments shared by the hero and the
 * "examples" showcase. Markup only — no network, no real widget or Inbox
 * code — so the landing page can show the product concretely without
 * depending on any feature module.
 */

export function VisitorBubble({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        'bg-lp-ink text-lp-paper ml-auto max-w-[85%] rounded-[20px] rounded-br-md px-4 py-2.5 text-[15px] leading-snug',
        className
      )}
    >
      {children}
    </p>
  );
}

export function AssistantBubble({
  children,
  source,
  className
}: {
  children: React.ReactNode;
  source?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex max-w-[88%] flex-col items-start gap-1.5', className)}>
      <p className='bg-lp-paper-deep text-lp-ink rounded-[20px] rounded-bl-md px-4 py-2.5 text-[15px] leading-snug'>
        {children}
      </p>
      {source ? (
        <span className='text-lp-sage-ink bg-lp-sage inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold'>
          <Icons.knowledge className='size-3.5' aria-hidden='true' />
          From your Knowledge Base · {source}
        </span>
      ) : null}
    </div>
  );
}

export function WidgetFrame({
  name,
  initials,
  accent = 'bg-lp-sun',
  children,
  className
}: {
  name: string;
  initials: string;
  accent?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'border-lp-line bg-lp-card shadow-lp-card overflow-hidden rounded-[28px] border',
        className
      )}
    >
      <div className='border-lp-line flex items-center gap-3 border-b px-5 py-4'>
        <span
          aria-hidden='true'
          className={cn(
            'text-lp-ink flex size-10 items-center justify-center rounded-full text-sm font-extrabold',
            accent
          )}
        >
          {initials}
        </span>
        <div className='min-w-0'>
          <p className='text-lp-ink truncate text-[15px] leading-tight font-bold'>{name}</p>
          <p className='text-lp-muted mt-0.5 flex items-center gap-1.5 text-xs font-semibold'>
            <span aria-hidden='true' className='bg-lp-sage-ink size-1.5 rounded-full' />
            Ask us anything
          </p>
        </div>
      </div>
      <div className='flex flex-col gap-3 px-5 py-5'>{children}</div>
      <div className='px-5 pb-5'>
        <div className='border-lp-line text-lp-muted flex items-center justify-between rounded-full border px-4 py-2.5 text-sm'>
          Type your question…
          <span
            aria-hidden='true'
            className='bg-lp-ink text-lp-paper flex size-7 items-center justify-center rounded-full'
          >
            <Icons.arrowRight className='size-4 -rotate-90' />
          </span>
        </div>
      </div>
    </div>
  );
}

export type InboxTone = 'lead' | 'handoff' | 'unanswered';

const TONE: Record<InboxTone, { label: string; className: string }> = {
  lead: { label: 'Lead captured', className: 'bg-lp-sage text-lp-sage-ink' },
  handoff: { label: 'Needs a person', className: 'bg-lp-coral-soft text-lp-coral' },
  unanswered: { label: 'Unanswered question', className: 'bg-lp-sun-soft text-lp-ink' }
};

export function InboxCard({
  who,
  initials,
  message,
  tones,
  meta,
  className
}: {
  who: string;
  initials: string;
  message: string;
  tones: InboxTone[];
  meta?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'border-lp-line bg-lp-card shadow-lp-card rounded-[24px] border p-5',
        className
      )}
    >
      <div className='text-lp-muted flex items-center justify-between text-xs font-bold tracking-[0.1em] uppercase'>
        <span className='flex items-center gap-2'>
          <Icons.galleryVerticalEnd className='size-4' aria-hidden='true' />
          Your Inbox
        </span>
        <span className='tracking-normal normal-case'>just now</span>
      </div>
      <div className='mt-4 flex items-center gap-3'>
        <span
          aria-hidden='true'
          className='bg-lp-lilac text-lp-lilac-ink flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-extrabold'
        >
          {initials}
        </span>
        <div className='min-w-0'>
          <p className='text-lp-ink truncate text-[15px] font-bold'>{who}</p>
          {meta ? <p className='text-lp-muted truncate text-xs font-semibold'>{meta}</p> : null}
        </div>
      </div>
      <p className='lp-display text-lp-ink mt-3 text-[17px] leading-snug'>
        &ldquo;{message}&rdquo;
      </p>
      <div className='mt-4 flex flex-wrap gap-2'>
        {tones.map((tone) => (
          <span
            key={tone}
            className={cn('rounded-full px-3 py-1 text-xs font-bold', TONE[tone].className)}
          >
            {TONE[tone].label}
          </span>
        ))}
      </div>
    </div>
  );
}
