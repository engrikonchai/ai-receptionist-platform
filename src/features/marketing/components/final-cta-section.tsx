import { MarketingButton } from './marketing-button';

export function FinalCtaSection() {
  return (
    <section className='bg-daylight-indigo px-5 py-16 text-center sm:px-8 sm:py-20 lg:px-12 lg:py-28'>
      <h2 className='mx-auto max-w-3xl text-[34px] leading-[1.1] font-extrabold tracking-[-0.038em] text-white sm:text-[44px] lg:text-[62px] lg:leading-[1.05]'>
        Give every visitor an answer.
      </h2>
      <p className='font-daylight-serif mx-auto mt-3.5 max-w-md text-base leading-relaxed text-daylight-on-indigo-muted sm:mt-5.5 sm:text-lg lg:text-[19px]'>
        Add what you know, install the widget, and see every conversation in one Inbox.
      </p>
      <div className='mx-auto mt-6 flex max-w-xs flex-col justify-center gap-2.5 sm:mt-9 sm:max-w-none sm:flex-row sm:gap-3'>
        <MarketingButton href='/signup' variant='primary-on-navy' fullWidthOnMobile>
          Get started
        </MarketingButton>
        <MarketingButton href='/demo' variant='secondary-on-navy' fullWidthOnMobile>
          See how it works
        </MarketingButton>
      </div>
    </section>
  );
}
