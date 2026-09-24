'use client';

import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  AssistantBubble,
  InboxCard,
  VisitorBubble,
  WidgetFrame,
  type InboxTone
} from './conversation-ui';

type Example = {
  id: string;
  tab: string;
  business: string;
  initials: string;
  question: string;
  answer: string;
  source: string;
  inbox: { who: string; initials: string; meta: string; message: string; tones: InboxTone[] };
  /** Tinted backdrop + widget avatar accent, so each business feels distinct. */
  stage: string;
  accent: string;
  takeaway: string;
};

/** Fictional businesses and people, for illustration only. */
const EXAMPLES: Example[] = [
  {
    id: 'clinic',
    tab: 'Dental clinic',
    business: 'Harbour Dental',
    initials: 'HD',
    question: 'Are you taking new patients?',
    answer:
      'Yes — we’re welcoming new patients. A first visit takes about 45 minutes and includes an X-ray.',
    source: 'New patients',
    inbox: {
      who: 'Priya Nair',
      initials: 'PN',
      meta: 'priya.n@mail.com',
      message: 'Yes please — I’d like to arrange a first visit for next week.',
      tones: ['lead']
    },
    stage: 'bg-lp-sky',
    accent: 'bg-lp-sky',
    takeaway: 'A new patient asks a simple question and leaves their details. You just follow up.'
  },
  {
    id: 'hardware',
    tab: 'Hardware store',
    business: 'Copperfield Hardware',
    initials: 'CH',
    question: 'Can I return paint once it’s been opened?',
    answer:
      'Unopened paint can be returned within 30 days with a receipt. Tinted paint can’t be returned.',
    source: 'Returns policy',
    inbox: {
      who: 'Anonymous visitor',
      initials: '?',
      meta: 'Asked a moment later',
      message: 'Do you cut keys for car fobs?',
      tones: ['unanswered']
    },
    stage: 'bg-lp-paper-deep',
    accent: 'bg-lp-blue-soft',
    takeaway:
      'When there’s no matching answer, the question is kept for you so you can add one in a step.'
  },
  {
    id: 'consultancy',
    tab: 'Consultancy',
    business: 'Aldridge Partners',
    initials: 'AP',
    question: 'How much do you charge for a first meeting?',
    answer:
      'Your first 30-minute consultation is free. After that, fees are agreed in writing before any work starts.',
    source: 'Pricing',
    inbox: {
      who: 'Tom Reyes',
      initials: 'TR',
      meta: 'tom@reyesbuild.co',
      message: 'I’d rather talk this through with a person — it’s a contract question.',
      tones: ['lead', 'handoff']
    },
    stage: 'bg-lp-lilac',
    accent: 'bg-lp-lilac',
    takeaway: 'Sensitive questions go straight to you, with the whole conversation attached.'
  },
  {
    id: 'cafe',
    tab: 'Café',
    business: 'Thistle & Bloom Café',
    initials: 'TB',
    question: 'Do you have oat milk and anything gluten-free?',
    answer:
      'Oat, soy and almond milk are all available. We bake gluten-free brownies and a loaf every morning.',
    source: 'Menu & dietary',
    inbox: {
      who: 'Sam Okafor',
      initials: 'SO',
      meta: 'sam.okafor@mail.com',
      message: 'Great! Could someone confirm a table for 8 on Saturday?',
      tones: ['lead', 'handoff']
    },
    stage: 'bg-lp-coral-soft',
    accent: 'bg-lp-coral-soft',
    takeaway: 'Regulars get quick answers; bigger requests reach a person instead of getting lost.'
  },
  {
    id: 'shop',
    tab: 'Online shop',
    business: 'Harbor & Thread',
    initials: 'HT',
    question: 'How long does delivery take?',
    answer:
      'Orders ship within 2 business days, and you’ll get tracking details by email once it’s on its way.',
    source: 'Shipping',
    inbox: {
      who: 'Lena Fischer',
      initials: 'LF',
      meta: 'lena.f@mail.com',
      message: 'My order arrived damaged — who can I talk to?',
      tones: ['handoff']
    },
    stage: 'bg-lp-sage',
    accent: 'bg-lp-sage',
    takeaway:
      'Simple questions are handled instantly, so your team only sees the ones that need them.'
  }
];

export function ExamplesShowcase() {
  const [activeId, setActiveId] = useState(EXAMPLES[0].id);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const active = EXAMPLES.find((e) => e.id === activeId) ?? EXAMPLES[0];

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % EXAMPLES.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + EXAMPLES.length) % EXAMPLES.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = EXAMPLES.length - 1;
    else return;
    event.preventDefault();
    setActiveId(EXAMPLES[next].id);
    tabRefs.current[EXAMPLES[next].id]?.focus();
  }

  return (
    <div>
      <div
        role='tablist'
        aria-label='Example businesses'
        className='-mx-5 flex snap-x gap-2 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden'
      >
        {EXAMPLES.map((example, index) => {
          const selected = example.id === activeId;
          return (
            <button
              key={example.id}
              ref={(el) => {
                tabRefs.current[example.id] = el;
              }}
              type='button'
              role='tab'
              id={`example-tab-${example.id}`}
              aria-selected={selected}
              aria-controls='example-panel'
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(example.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                'shrink-0 snap-start rounded-full border-2 px-5 py-2.5 text-[15px] font-bold whitespace-nowrap transition-colors',
                selected
                  ? 'border-lp-blue bg-lp-blue text-white'
                  : 'border-lp-line bg-lp-card text-lp-ink-soft hover:border-lp-ink/30 hover:text-lp-ink'
              )}
            >
              {example.tab}
            </button>
          );
        })}
      </div>

      <div
        role='tabpanel'
        id='example-panel'
        aria-labelledby={`example-tab-${active.id}`}
        className={cn(
          'mt-6 rounded-[36px] p-5 transition-colors duration-500 sm:p-10 lg:p-14',
          active.stage
        )}
      >
        <div
          key={active.id}
          className='lp-rise grid items-center gap-8 lg:grid-cols-[1fr_0.9fr] lg:gap-14'
        >
          <div>
            <p className='text-lp-ink/70 mb-3 text-xs font-extrabold tracking-[0.12em] uppercase'>
              1 · The customer asks
            </p>
            <WidgetFrame name={active.business} initials={active.initials} accent={active.accent}>
              <VisitorBubble>{active.question}</VisitorBubble>
              <AssistantBubble source={active.source}>{active.answer}</AssistantBubble>
            </WidgetFrame>
          </div>
          <div>
            <p className='text-lp-ink/70 mb-3 text-xs font-extrabold tracking-[0.12em] uppercase'>
              2 · You see it in your Inbox
            </p>
            <InboxCard {...active.inbox} />
            <p className='text-lp-ink mt-5 text-[17px] leading-relaxed font-semibold text-pretty'>
              {active.takeaway}
            </p>
          </div>
        </div>
      </div>
      <p className='text-lp-muted mt-4 text-center text-xs font-semibold'>
        Fictional businesses and conversations, shown for illustration.
      </p>
    </div>
  );
}
