import { Icons } from '@/components/icons';

const CAPABILITIES = [
  {
    icon: Icons.chat,
    title: 'A chat widget for your site',
    description:
      'Visitors open the chat and ask in their own words. Colors, greeting and position match your brand.'
  },
  {
    icon: Icons.knowledge,
    title: 'Answers from your Knowledge Base',
    description:
      'Add your hours, services, prices and policies. Replies come from those entries, and nothing else.'
  },
  {
    icon: Icons.leads,
    title: 'Lead capture',
    description:
      "When a visitor shares their name, email or request, it's saved as a lead you can follow up."
  },
  {
    icon: Icons.share,
    title: 'Human handoff',
    description:
      'When a question needs a person, the conversation is handed off to the business with everything said so far.'
  },
  {
    icon: Icons.galleryVerticalEnd,
    title: 'Your business Inbox',
    description:
      'Every conversation and its full history in one place, with a clear status. Visible only to the business owner.'
  },
  {
    icon: Icons.settings,
    title: 'Response style you set',
    description: 'Choose the tone, how long replies should be, and add your own instructions.'
  }
] as const;

export function CapabilitiesSection() {
  return (
    <section
      id='capabilities'
      className='scroll-mt-20 bg-white px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24'
    >
      <div className='mx-auto flex max-w-7xl flex-col items-end gap-5 sm:flex-row sm:justify-between'>
        <div>
          <p className='text-daylight-muted text-xs font-bold tracking-[0.12em] uppercase'>
            Capabilities
          </p>
          <h2 className='text-daylight-ink mt-3 max-w-160 text-[30px] leading-[1.12] font-extrabold tracking-[-0.035em] sm:text-[36px] lg:text-[46px] lg:leading-[1.08]'>
            What a good front desk does, on your website.
          </h2>
        </div>
        <p className='text-daylight-ink-soft max-w-90 text-base leading-relaxed'>
          Visitors chat on your site. Every conversation, lead and handoff lands in your business
          Inbox.
        </p>
      </div>

      <div className='mx-auto mt-8 grid max-w-7xl gap-3.5 sm:mt-10 sm:grid-cols-2 lg:mt-12 lg:grid-cols-3'>
        {CAPABILITIES.map((item) => (
          <div key={item.title} className='rounded-daylight-card bg-daylight-surface-muted p-6.5'>
            <div className='rounded-daylight-card-sm text-daylight-indigo flex size-12 items-center justify-center bg-white'>
              <item.icon className='size-6' strokeWidth={1.75} aria-hidden='true' />
            </div>
            <h3 className='text-daylight-ink mt-5 text-xl font-extrabold tracking-[-0.02em]'>
              {item.title}
            </h3>
            <p className='text-daylight-ink-soft mt-2.5 text-[15px] leading-relaxed'>
              {item.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
