const TRUST_ITEMS = [
  {
    title: 'Answers come from your entries',
    description: 'Each reply in the conversation history shows which Knowledge Base entry it used.'
  },
  {
    title: 'Unanswered questions surface',
    description: 'Questions without a match are listed so you can add an answer in one step.'
  },
  {
    title: 'A person when it matters',
    description:
      'Handed-off conversations wait in the Inbox — the business owner can continue with the full history.'
  },
  {
    title: 'Your data stays with your business',
    description:
      'Conversations, leads and knowledge are scoped to your account and visible only to the business owner.'
  }
] as const;

export function TrustSection() {
  return (
    <section className='bg-daylight-navy px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24'>
      <div className='mx-auto grid max-w-7xl gap-9 lg:grid-cols-2 lg:gap-18'>
        <div>
          <p className='text-daylight-on-navy-eyebrow text-xs font-bold tracking-[0.12em] uppercase'>
            Trust and control
          </p>
          <h2 className='mt-3 max-w-120 text-[30px] leading-[1.12] font-extrabold tracking-[-0.035em] text-white sm:text-[36px] lg:text-[46px] lg:leading-[1.08]'>
            It only says what you&apos;ve written.
          </h2>
          <p className='font-daylight-serif text-daylight-on-navy-body mt-3.5 max-w-115 text-base leading-relaxed text-pretty sm:mt-5 sm:text-lg'>
            Replies are matched to your Knowledge Base. When nothing matches, it says so, offers a
            person and keeps the question for you to answer.
          </p>
        </div>

        <div className='grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1'>
          {TRUST_ITEMS.map((item) => (
            <div
              key={item.title}
              className='bg-daylight-navy-panel rounded-daylight-card-sm p-5 sm:p-6.5'
            >
              <p className='text-[16px] font-bold text-white sm:text-[17px]'>{item.title}</p>
              <p className='text-daylight-on-navy-muted mt-1.5 text-sm leading-relaxed sm:mt-2 sm:text-[15px]'>
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
