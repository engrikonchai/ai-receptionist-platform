import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import { DEMO_BUSINESSES } from '../scenarios';
import type { DemoBusiness } from '../types';

type BusinessSelectorProps = {
  selectedBusiness: DemoBusiness | undefined;
  onSelect: (businessId: string) => void;
  onOpenChat: () => void;
};

export function BusinessSelector({
  selectedBusiness,
  onSelect,
  onOpenChat
}: BusinessSelectorProps) {
  return (
    <div className='rounded-daylight-card shadow-daylight-lg bg-white p-7 sm:p-9'>
      <div className='flex flex-wrap items-baseline gap-3'>
        <h1 className='text-daylight-ink text-[26px] font-extrabold tracking-[-0.03em] sm:text-[28px]'>
          Try the website chat
        </h1>
        <span className='text-daylight-ink-soft text-sm'>No signup. Nothing saved.</span>
      </div>
      <p className='text-daylight-ink-soft mt-2.5 max-w-lg text-[15px] leading-relaxed'>
        Pick an example business to chat with. All businesses, people, messages and contact details
        below are fictional examples for this demo.
      </p>

      <div role='group' aria-label='Example business type' className='mt-5 flex flex-wrap gap-2'>
        {DEMO_BUSINESSES.map((business) => {
          const isSelected = business.id === selectedBusiness?.id;
          return (
            <button
              key={business.id}
              type='button'
              aria-pressed={isSelected}
              onClick={() => onSelect(business.id)}
              className={cn(
                'focus-visible:outline-daylight-focus rounded-full px-4.5 py-2.75 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
                isSelected
                  ? 'bg-daylight-indigo shadow-daylight-button text-white'
                  : 'bg-daylight-indigo-tint text-daylight-ink-soft hover:bg-daylight-indigo-tint-2'
              )}
            >
              {business.categoryLabel}
            </button>
          );
        })}
      </div>

      {selectedBusiness ? (
        <div className='bg-daylight-surface-muted rounded-daylight-card-sm mt-6 p-6'>
          <p className='text-daylight-muted text-xs font-bold tracking-[0.12em] uppercase'>
            {selectedBusiness.name} · sample Knowledge Base
          </p>
          <div className='mt-3.5 flex flex-wrap gap-2'>
            {selectedBusiness.knowledgeBase.map((entry) => (
              <span
                key={entry.id}
                className='rounded-full bg-white px-3.5 py-1.5 text-[13px] font-semibold text-daylight-ink-soft'
              >
                {entry.topic}
              </span>
            ))}
          </div>
          <div className='mt-5 flex flex-wrap gap-6'>
            <div>
              <p className='text-daylight-muted text-xs font-semibold'>Tone</p>
              <p className='text-daylight-ink mt-0.5 text-[15px] font-bold'>
                {selectedBusiness.tone}
              </p>
            </div>
            <div>
              <p className='text-daylight-muted text-xs font-semibold'>Response length</p>
              <p className='text-daylight-ink mt-0.5 text-[15px] font-bold'>
                {selectedBusiness.responseLength}
              </p>
            </div>
            <div>
              <p className='text-daylight-muted text-xs font-semibold'>Handoff</p>
              <p className='text-daylight-ink mt-0.5 text-[15px] font-bold'>
                {selectedBusiness.handoffPolicy}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className='border-daylight-border bg-daylight-surface-muted mt-6 rounded-daylight-card-sm border border-dashed px-8 py-11 text-center'>
          <div className='bg-daylight-indigo-tint text-daylight-indigo mx-auto flex size-13 items-center justify-center rounded-daylight-icon'>
            <Icons.chat className='size-6' aria-hidden='true' />
          </div>
          <p className='text-daylight-ink-soft mt-3.5 text-[15px] font-bold'>
            Choose a business above to open its chat
          </p>
          <p className='text-daylight-muted mt-1.5 text-sm'>You&apos;ll type your own questions.</p>
        </div>
      )}

      <div className='mt-6 flex items-center gap-3'>
        <button
          type='button'
          disabled={!selectedBusiness}
          onClick={onOpenChat}
          className='bg-daylight-indigo shadow-daylight-button hover:bg-daylight-indigo-hover focus-visible:outline-daylight-focus rounded-daylight-button min-h-11 shrink-0 px-6.5 py-3.75 text-[15px] font-bold whitespace-nowrap text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-daylight-indigo-tint-2 disabled:text-daylight-muted disabled:shadow-none'
        >
          Open the chat
        </button>
        {!selectedBusiness ? (
          <span className='text-daylight-muted text-sm'>
            Disabled until a business is selected.
          </span>
        ) : null}
      </div>
    </div>
  );
}
