import { Icons } from '@/components/icons';
import { LandingButton } from './landing-button';
import { ProductPreview } from './product-preview';

const PROOF_POINTS = [
  'Answers only from what you’ve written',
  'Saves every lead it collects',
  'You can step into any conversation'
] as const;

export function HeroSection() {
  return (
    <section className='mx-auto max-w-6xl px-5 pt-10 pb-20 sm:px-8 sm:pt-16 lg:pt-20 lg:pb-56'>
      <div className='grid items-center gap-14 lg:grid-cols-[1.02fr_1fr] lg:gap-10'>
        <div className='lp-rise'>
          <p className='bg-lp-card border-lp-line text-lp-ink shadow-lp-soft inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[13px] font-bold'>
            <Icons.sparkles className='text-lp-coral size-4' aria-hidden='true' />
            An AI assistant for your website
          </p>

          <h1 className='lp-display mt-6 text-[44px] leading-[1.02] font-semibold text-balance sm:text-[60px] lg:text-[68px]'>
            Answer every customer question,{' '}
            <em className='lp-mark not-italic'>right on your website.</em>
          </h1>

          <p className='text-lp-ink-soft mt-6 max-w-xl text-[17px] leading-relaxed text-pretty sm:text-lg'>
            Teach the assistant about your business once. It replies to visitors in your words,
            collects their contact details, and brings you in when a real person is needed.
          </p>

          <div className='mt-8 flex flex-col gap-3 sm:flex-row'>
            <LandingButton href='/signup' fullWidthOnMobile>
              Get started
            </LandingButton>
            <LandingButton href='/demo' variant='secondary' fullWidthOnMobile>
              Try the demo
            </LandingButton>
          </div>

          <ul className='text-lp-ink-soft mt-9 flex flex-col gap-2.5 text-[15px] font-semibold'>
            {PROOF_POINTS.map((point) => (
              <li key={point} className='flex items-center gap-2.5'>
                <span
                  aria-hidden='true'
                  className='bg-lp-sage text-lp-sage-ink flex size-5 shrink-0 items-center justify-center rounded-full'
                >
                  <Icons.check className='size-3' strokeWidth={3.5} />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div id='product-preview' className='scroll-mt-24 lg:pb-56'>
          <ProductPreview />
        </div>
      </div>
    </section>
  );
}
