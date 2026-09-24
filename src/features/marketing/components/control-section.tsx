import { Icons } from '@/components/icons';

const POINTS = [
  {
    title: 'Answers come from your entries',
    description: 'Every reply shows which Knowledge Base entry it used.'
  },
  {
    title: 'Gaps become to-dos',
    description: 'Questions with no match are listed so you can add an answer in one step.'
  },
  {
    title: 'A person when it matters',
    description: 'Handed-off conversations wait in your Inbox with the full history.'
  },
  {
    title: 'Your data stays yours',
    description:
      'Conversations, leads and knowledge belong to your account and are visible only to you.'
  }
] as const;

export function ControlSection() {
  return (
    <section id='control' className='scroll-mt-20 px-3 py-10 sm:px-6 lg:py-16'>
      <div className='bg-lp-sage mx-auto max-w-6xl rounded-[36px] px-5 py-14 sm:rounded-[48px] sm:px-12 lg:px-16 lg:py-20'>
        <div className='grid items-center gap-12 lg:grid-cols-[1fr_0.95fr] lg:gap-16'>
          <div>
            <p className='text-lp-sage-ink text-xs font-extrabold tracking-[0.14em] uppercase'>
              Trust and control
            </p>
            <h2 className='lp-display mt-3 text-[34px] leading-[1.05] font-semibold text-balance sm:text-[48px]'>
              It only says what <em className='lp-mark not-italic'>you’ve written.</em>
            </h2>
            <p className='text-lp-ink-soft mt-5 max-w-lg text-[17px] leading-relaxed text-pretty'>
              When nothing in your Knowledge Base matches, the assistant says so, offers a person,
              and keeps the question for you. No guessing, no made-up prices.
            </p>

            <dl className='mt-9 flex flex-col gap-5'>
              {POINTS.map((point) => (
                <div key={point.title} className='flex gap-4'>
                  <span
                    aria-hidden='true'
                    className='bg-lp-ink text-lp-sun mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full'
                  >
                    <Icons.check className='size-3.5' strokeWidth={3.5} />
                  </span>
                  <div>
                    <dt className='text-lp-ink text-[17px] font-extrabold'>{point.title}</dt>
                    <dd className='text-lp-ink-soft mt-0.5 text-[15px] leading-relaxed'>
                      {point.description}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>

          <div
            role='img'
            aria-label='Example: a list of unanswered questions with an Add answer action'
            className='relative'
          >
            <div
              aria-hidden='true'
              className='bg-lp-card border-lp-line shadow-lp-card rounded-[28px] border p-5 sm:p-7'
            >
              <p className='text-lp-muted flex items-center gap-2 text-xs font-extrabold tracking-[0.1em] uppercase'>
                <Icons.help className='size-4' />
                Needs an answer
              </p>
              <ul className='mt-4 flex flex-col gap-3'>
                {[
                  ['Do you cut keys for car fobs?', '3 times this week'],
                  ['Is there step-free access?', '2 times this week'],
                  ['Can I pay by invoice?', 'Once this week']
                ].map(([question, count], index) => (
                  <li
                    key={question}
                    className='border-lp-line flex items-center justify-between gap-3 rounded-2xl border px-4 py-3.5'
                  >
                    <div className='min-w-0'>
                      <p className='text-lp-ink text-[15px] leading-snug font-bold'>{question}</p>
                      <p className='text-lp-muted mt-0.5 text-xs font-semibold'>{count}</p>
                    </div>
                    <span
                      className={
                        index === 0
                          ? 'bg-lp-ink text-lp-paper shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold'
                          : 'border-lp-ink/25 text-lp-ink shrink-0 rounded-full border-2 px-3.5 py-1 text-xs font-bold'
                      }
                    >
                      Add answer
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div
              aria-hidden='true'
              className='bg-lp-sun text-lp-ink shadow-lp-soft absolute -bottom-5 -left-2 rotate-[-3deg] rounded-2xl px-4 py-2.5 text-sm font-extrabold sm:-left-6'
            >
              Add it once — it’s answered for good.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
