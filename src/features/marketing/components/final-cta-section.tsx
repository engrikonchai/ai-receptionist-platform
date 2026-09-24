import { LandingButton } from './landing-button';

export function FinalCtaSection() {
  return (
    <section className='px-3 pt-10 pb-16 sm:px-6 lg:pt-16 lg:pb-24'>
      <div className='bg-lp-blue relative mx-auto max-w-6xl overflow-hidden rounded-[36px] px-6 py-16 text-center sm:rounded-[48px] sm:px-12 lg:py-24'>
        <div
          aria-hidden='true'
          className='bg-lp-blue-deep/40 absolute -top-24 -left-16 size-72 rounded-full'
        />
        <div
          aria-hidden='true'
          className='bg-white/10 absolute -right-20 -bottom-28 size-80 rounded-full'
        />
        <div className='relative'>
          <h2 className='lp-display mx-auto max-w-3xl text-[38px] leading-[1.04] text-white font-semibold text-balance sm:text-[56px] lg:text-[64px]'>
            Give every visitor an answer.
          </h2>
          <p className='text-white/85 mx-auto mt-5 max-w-lg text-[17px] leading-relaxed text-pretty'>
            Add what you know, paste one snippet into your site, and watch conversations arrive in
            your Inbox.
          </p>
          <div className='mx-auto mt-9 flex max-w-xs flex-col justify-center gap-3 sm:max-w-none sm:flex-row'>
            <LandingButton href='/signup' variant='onBlue' fullWidthOnMobile>
              Get started
            </LandingButton>
            <LandingButton href='/demo' variant='onBlueOutline' fullWidthOnMobile>
              Try the demo
            </LandingButton>
          </div>
        </div>
      </div>
    </section>
  );
}
