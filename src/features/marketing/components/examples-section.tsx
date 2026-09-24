import { ExamplesShowcase } from './examples-showcase';

export function ExamplesSection() {
  return (
    <section id='examples' className='mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:px-8 lg:py-28'>
      <div className='mx-auto max-w-2xl text-center'>
        <p className='text-lp-coral text-xs font-extrabold tracking-[0.14em] uppercase'>
          Any kind of business
        </p>
        <h2 className='lp-display mt-3 text-[34px] leading-[1.05] font-semibold text-balance sm:text-[48px]'>
          One assistant. <span className='lp-mark'>Whatever</span> you do.
        </h2>
        <p className='text-lp-ink-soft mt-5 text-[17px] leading-relaxed text-pretty'>
          There’s no industry template to squeeze into. You write the answers, so customers hear
          your business — a clinic, a shop, a café or a consultancy.
        </p>
      </div>
      <div className='mt-10 sm:mt-12'>
        <ExamplesShowcase />
      </div>
    </section>
  );
}
