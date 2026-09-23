const YOU_ADD = [
  'Opening hours and location',
  'Services and prices',
  'Policies and common questions',
  'How to reach your team'
];

const CUSTOMERS_ASK = [
  'What time do you close today?',
  'Do you offer refunds?',
  'Can I speak to someone about an order?'
];

const IT_RESPONDS = [
  'Answers from the matching entry',
  'Saves contact details as a lead',
  'Hands off to a person when asked',
  "Flags questions it couldn't answer"
];

export function AnyBusinessSection() {
  return (
    <section className='px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24'>
      <div className='mx-auto max-w-3xl text-center'>
        <p className='text-daylight-muted text-xs font-bold tracking-[0.12em] uppercase'>
          For any kind of business
        </p>
        <h2 className='text-daylight-ink mt-3 text-[30px] leading-[1.12] font-extrabold tracking-[-0.035em] sm:text-[36px] lg:text-[46px] lg:leading-[1.08]'>
          Your business, in your words.
        </h2>
        <p className='text-daylight-ink-soft mt-4 text-base leading-relaxed sm:text-[17px]'>
          There&apos;s no industry template to fit into. What you add to the Knowledge Base is what
          your customers hear.
        </p>
      </div>

      <div className='mx-auto mt-8 grid max-w-7xl gap-3.5 sm:mt-10 sm:grid-cols-2 lg:mt-12 lg:grid-cols-3'>
        <div className='rounded-daylight-card shadow-daylight-md bg-white p-6.5'>
          <p className='text-daylight-indigo text-xs font-bold tracking-[0.12em] uppercase'>
            You add
          </p>
          <ul className='text-daylight-ink-soft mt-4 flex flex-col gap-2.5 text-[15px] leading-relaxed'>
            {YOU_ADD.map((item) => (
              <li key={item} className='flex gap-2.5'>
                <span aria-hidden='true' className='text-daylight-success font-extrabold'>
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className='rounded-daylight-card shadow-daylight-md bg-white p-6.5'>
          <p className='text-daylight-indigo text-xs font-bold tracking-[0.12em] uppercase'>
            Customers ask
          </p>
          <ul className='mt-4 flex flex-col gap-3'>
            {CUSTOMERS_ASK.map((item) => (
              <li
                key={item}
                className='font-daylight-serif text-daylight-ink text-base leading-relaxed'
              >
                &ldquo;{item}&rdquo;
              </li>
            ))}
          </ul>
        </div>

        <div className='bg-daylight-navy rounded-daylight-card p-6.5 sm:col-span-2 lg:col-span-1'>
          <p className='text-daylight-on-navy-muted text-xs font-bold tracking-[0.12em] uppercase'>
            It responds
          </p>
          <ul className='text-daylight-on-navy-body mt-4 flex flex-col gap-2.5 text-[15px] leading-relaxed'>
            {IT_RESPONDS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
