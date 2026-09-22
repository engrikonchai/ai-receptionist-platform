const STEPS = [
  {
    number: '01',
    title: 'Add your business knowledge',
    description: "Write the questions customers ask and the answers you'd give. Edit them any time."
  },
  {
    number: '02',
    title: 'Set the response style',
    description: 'Choose a tone and response length, and add your own custom instructions.'
  },
  {
    number: '03',
    title: 'Install the widget',
    description:
      'Style it to match your site, copy the install snippet, and test the widget before it goes live.'
  }
] as const;

export function HowItWorksSection() {
  return (
    <section
      id='how-it-works'
      className='scroll-mt-20 bg-white px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24'
    >
      <div className='mx-auto max-w-7xl'>
        <p className='text-daylight-muted text-xs font-bold tracking-[0.12em] uppercase'>
          How it works
        </p>
        <h2 className='text-daylight-ink mt-3 max-w-160 text-[30px] leading-[1.12] font-extrabold tracking-[-0.035em] sm:text-[36px] lg:text-[46px] lg:leading-[1.08]'>
          Three steps to your first conversation.
        </h2>

        <ol className='mt-8 grid gap-5.5 sm:mt-10 sm:grid-cols-3 sm:gap-3.5 lg:mt-12'>
          {STEPS.map((step) => (
            <li key={step.number} className='border-daylight-indigo border-t-3 pt-4 sm:pt-6'>
              <span
                aria-hidden='true'
                className='text-daylight-indigo-tint-2 text-[34px] leading-none font-extrabold tracking-[-0.04em] sm:text-[54px]'
              >
                {step.number}
              </span>
              <h3 className='text-daylight-ink mt-2 text-lg font-extrabold tracking-[-0.02em] sm:mt-3.5 sm:text-[22px]'>
                {step.title}
              </h3>
              <p className='text-daylight-ink-soft mt-1.5 text-sm leading-relaxed sm:mt-2.5 sm:text-[15px]'>
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
