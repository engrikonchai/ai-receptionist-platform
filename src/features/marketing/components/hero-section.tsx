import { MarketingButton } from './marketing-button';
import { ProductPreview } from './product-preview';

export function HeroSection() {
  return (
    <section className='mx-auto max-w-7xl px-5 pt-12 pb-16 sm:px-8 sm:pt-16 sm:pb-20 lg:px-12 lg:pt-20 lg:pb-24'>
      <div className='grid items-center gap-14 lg:grid-cols-[1fr_540px] lg:gap-18'>
        <div>
          <div className='text-daylight-indigo inline-flex items-center gap-2.5 rounded-full bg-white px-4 py-2.25 text-[13px] font-bold'>
            <span aria-hidden='true' className='bg-daylight-indigo size-1.75 rounded-full' />
            Customer conversations, handled.
          </div>

          <h1 className='text-daylight-ink mt-6 text-[46px] leading-[1.04] font-extrabold tracking-[-0.038em] sm:text-[54px] lg:text-[64px] lg:leading-[1.05]'>
            Every customer gets an answer.
          </h1>

          <p className='font-daylight-serif text-daylight-ink-soft mt-4 max-w-lg text-base leading-relaxed text-pretty sm:mt-6.5 sm:text-lg lg:text-[19px]'>
            Give your business one place to answer common questions, capture leads and bring in a
            human when it matters.
          </p>

          <div className='mt-6.5 flex flex-col gap-3 sm:mt-9 sm:flex-row'>
            <MarketingButton href='/signup' fullWidthOnMobile>
              Get started
            </MarketingButton>
            <MarketingButton href='#product-preview' variant='secondary' fullWidthOnMobile>
              See how it works
            </MarketingButton>
          </div>

          <div className='text-daylight-ink-soft mt-6.5 flex flex-wrap gap-x-4.5 gap-y-2 text-sm font-semibold sm:mt-8'>
            <span>Website chat widget</span>
            <span aria-hidden='true' className='text-daylight-indigo-tint-2'>
              ·
            </span>
            <span>Your business Inbox</span>
            <span aria-hidden='true' className='text-daylight-indigo-tint-2'>
              ·
            </span>
            <span>Human handoff</span>
          </div>
        </div>

        <div id='product-preview' className='scroll-mt-20'>
          <ProductPreview />
        </div>
      </div>
    </section>
  );
}
