import { cn } from '@/lib/utils';

/**
 * A slow, pausable ribbon of real-sounding customer questions from very
 * different businesses. Decorative: the duplicated half is aria-hidden
 * and the whole strip is presentational, so assistive tech reads the list
 * once. With reduced motion it stops and simply overflows-clips.
 */
const QUESTIONS: { text: string; tone: string }[] = [
  { text: 'Do you take new patients?', tone: 'bg-lp-sky text-lp-sky-ink' },
  { text: 'Can I return paint once it’s opened?', tone: 'bg-lp-blue-soft text-lp-blue-deep' },
  { text: 'What time do you close today?', tone: 'bg-lp-sage text-lp-sage-ink' },
  { text: 'Do you have gluten-free options?', tone: 'bg-lp-coral-soft text-lp-coral' },
  { text: 'How much is a first consultation?', tone: 'bg-lp-lilac text-lp-lilac-ink' },
  { text: 'Where is my order?', tone: 'bg-lp-sky text-lp-sky-ink' },
  { text: 'Is there parking nearby?', tone: 'bg-lp-blue-soft text-lp-blue-deep' },
  { text: 'Can I speak to someone about my invoice?', tone: 'bg-lp-sage text-lp-sage-ink' },
  { text: 'Do you deliver on weekends?', tone: 'bg-lp-coral-soft text-lp-coral' },
  { text: 'What’s your cancellation policy?', tone: 'bg-lp-lilac text-lp-lilac-ink' }
];

function Row({ hidden }: { hidden?: boolean }) {
  return (
    <ul aria-hidden={hidden || undefined} className='flex shrink-0 gap-3 pr-3'>
      {QUESTIONS.map((q) => (
        <li
          key={q.text}
          className={cn('rounded-full px-5 py-3 text-[15px] font-bold whitespace-nowrap', q.tone)}
        >
          {q.text}
        </li>
      ))}
    </ul>
  );
}

export function QuestionMarquee() {
  return (
    <section
      aria-label='Questions customers ask every day, across every kind of business'
      className='border-lp-line border-y py-8'
    >
      <p className='text-lp-muted mb-5 px-5 text-center text-xs font-extrabold tracking-[0.14em] uppercase'>
        Asked every day, in every kind of business
      </p>
      <div className='lp-marquee overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]'>
        <div className='lp-marquee-track flex w-max'>
          <Row />
          <Row hidden />
        </div>
      </div>
    </section>
  );
}
