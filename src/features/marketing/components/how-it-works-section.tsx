import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';

/**
 * Three steps, each paired with a small real-looking fragment of the
 * product it describes (Knowledge Base entries, response style controls,
 * the install snippet) instead of an icon.
 */
function KnowledgeFragment() {
  const entries = [
    ['Opening hours', 'Mon–Fri 8:00–18:00, Sat 9:00–14:00'],
    ['Returns', 'Within 30 days with a receipt'],
    ['Pricing', 'First consultation is free']
  ] as const;
  return (
    <div className='flex flex-col gap-2.5'>
      {entries.map(([topic, answer]) => (
        <div
          key={topic}
          className='bg-lp-card border-lp-line shadow-lp-soft rounded-2xl border px-4 py-3'
        >
          <p className='text-lp-muted text-xs font-extrabold tracking-[0.1em] uppercase'>{topic}</p>
          <p className='text-lp-ink mt-1 text-[15px] font-semibold'>{answer}</p>
        </div>
      ))}
      <div className='border-lp-ink/25 text-lp-ink-soft rounded-2xl border-2 border-dashed px-4 py-3 text-[15px] font-semibold'>
        + Add another answer
      </div>
    </div>
  );
}

function StyleFragment() {
  const groups = [
    { label: 'Tone', options: ['Friendly', 'Professional'], selected: 'Friendly' },
    { label: 'Reply length', options: ['Concise', 'Detailed'], selected: 'Concise' }
  ];
  return (
    <div className='bg-lp-card border-lp-line shadow-lp-soft flex flex-col gap-5 rounded-2xl border p-5'>
      {groups.map((group) => (
        <div key={group.label}>
          <p className='text-lp-muted text-xs font-extrabold tracking-[0.1em] uppercase'>
            {group.label}
          </p>
          <div className='mt-2 flex flex-wrap gap-2'>
            {group.options.map((option) => (
              <span
                key={option}
                className={cn(
                  'rounded-full border-2 px-4 py-1.5 text-sm font-bold',
                  option === group.selected
                    ? 'border-lp-ink bg-lp-ink text-lp-paper'
                    : 'border-lp-line text-lp-ink-soft'
                )}
              >
                {option}
              </span>
            ))}
          </div>
        </div>
      ))}
      <div>
        <p className='text-lp-muted text-xs font-extrabold tracking-[0.1em] uppercase'>
          Your instructions
        </p>
        <p className='bg-lp-paper text-lp-ink-soft mt-2 rounded-xl px-3.5 py-2.5 text-sm leading-snug'>
          Always mention that we’re closed on public holidays.
        </p>
      </div>
    </div>
  );
}

function InstallFragment() {
  return (
    <div className='bg-lp-ink overflow-hidden rounded-2xl shadow-lp-soft'>
      <div className='flex items-center gap-1.5 px-4 pt-3.5' aria-hidden='true'>
        <span className='bg-lp-coral size-2.5 rounded-full' />
        <span className='bg-lp-blue-mid size-2.5 rounded-full' />
        <span className='bg-lp-sage size-2.5 rounded-full' />
      </div>
      <pre className='text-lp-paper overflow-x-auto px-4 pt-3 pb-5 font-mono text-[13px] leading-relaxed'>
        <code>
          <span className='text-lp-blue-mid'>{'<script'}</span>
          {'\n  src="…/widget-loader.js"\n  data-widget-id="your-id"\n  async'}
          <span className='text-lp-blue-mid'>{'></script>'}</span>
        </code>
      </pre>
    </div>
  );
}

const STEPS = [
  {
    title: 'Write down what you know',
    description:
      'Add your hours, services, prices and policies as short answers. Edit them whenever things change.',
    visual: <KnowledgeFragment />,
    tint: 'bg-lp-blue-soft'
  },
  {
    title: 'Choose how it sounds',
    description:
      'Pick a tone and how long replies should be, and add any instructions of your own.',
    visual: <StyleFragment />,
    tint: 'bg-lp-lilac'
  },
  {
    title: 'Paste one line into your site',
    description:
      'Match the widget to your brand, copy the snippet, and test it before it goes live.',
    visual: <InstallFragment />,
    tint: 'bg-lp-paper-deep'
  }
] as const;

export function HowItWorksSection() {
  return (
    <section
      id='how-it-works'
      className='mx-auto max-w-6xl scroll-mt-20 px-5 py-16 sm:px-8 lg:py-24'
    >
      <div className='max-w-2xl'>
        <p className='text-lp-blue-deep text-xs font-extrabold tracking-[0.14em] uppercase'>
          How it works
        </p>
        <h2 className='lp-display mt-3 text-[34px] leading-[1.05] font-semibold text-balance sm:text-[48px]'>
          Set it up in <span className='lp-mark'>three</span> small steps.
        </h2>
      </div>

      <ol className='relative mt-12 flex flex-col gap-14 sm:mt-16 lg:gap-24'>
        {/* Mobile timeline rail */}
        <span
          aria-hidden='true'
          className='bg-lp-line absolute top-6 bottom-6 left-[19px] w-0.5 sm:hidden'
        />
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className='relative grid items-center gap-6 pl-12 sm:gap-10 sm:pl-0 lg:grid-cols-2 lg:gap-20'
          >
            <span
              aria-hidden='true'
              className='bg-lp-ink text-lp-paper absolute top-0 left-0 flex size-10 items-center justify-center rounded-full text-base font-extrabold sm:hidden'
            >
              {index + 1}
            </span>
            <div className={cn(index % 2 === 1 && 'lg:order-2')}>
              <span
                aria-hidden='true'
                className='lp-display text-lp-blue-soft mb-2 hidden text-[88px] leading-none font-semibold sm:block [-webkit-text-stroke:2px_var(--lp-blue)]'
              >
                {index + 1}
              </span>
              <h3 className='lp-display text-[28px] leading-tight font-semibold sm:text-[34px]'>
                {step.title}
              </h3>
              <p className='text-lp-ink-soft mt-3 max-w-md text-[17px] leading-relaxed'>
                {step.description}
              </p>
            </div>
            <div className={cn('rounded-[32px] p-5 sm:p-8', step.tint)}>{step.visual}</div>
          </li>
        ))}
      </ol>

      <p className='text-lp-muted mt-14 flex items-center gap-2 text-sm font-semibold'>
        <Icons.info className='size-4' aria-hidden='true' />
        Each step is editable later from your dashboard.
      </p>
    </section>
  );
}
