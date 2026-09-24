import { Icons } from '@/components/icons';
import { AssistantBubble, InboxCard, VisitorBubble, WidgetFrame } from './conversation-ui';

/**
 * The hero's product scene: what the customer sees (the website chat)
 * and what the owner receives (the Inbox entry), as static illustrative
 * markup. Fictional business and person — labelled as an example.
 */
function SideLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`bg-lp-card text-lp-ink border-lp-line shadow-lp-soft inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-extrabold ${className ?? ''}`}
    >
      {children}
    </span>
  );
}

export function ProductPreview() {
  return (
    <div
      role='img'
      aria-label='Example product preview: a visitor chats on a business website and the conversation arrives in the owner Inbox as a lead. Not a live conversation.'
      className='relative mx-auto w-full max-w-[440px] lg:max-w-none'
    >
      {/* Sun disc behind the scene */}
      <div
        aria-hidden='true'
        className='bg-lp-blue-mid absolute -top-6 right-[-8%] -z-0 size-[78%] rounded-full opacity-90 lg:right-[-4%]'
      />
      <div
        aria-hidden='true'
        className='bg-lp-coral-soft absolute bottom-10 -left-6 -z-0 size-24 rounded-full'
      />

      <div className='relative z-10' aria-hidden='true'>
        <SideLabel className='lp-rise mb-3 ml-1'>
          <Icons.chat className='size-3.5' />
          What your customer sees
        </SideLabel>

        <WidgetFrame
          name='Fernhill Studio'
          initials='FS'
          className='lp-rise [--lp-delay:120ms] lg:w-[400px]'
        >
          <VisitorBubble className='lp-rise [--lp-delay:350ms]'>
            Are you open on Saturdays?
          </VisitorBubble>
          <AssistantBubble source='Opening hours' className='lp-rise [--lp-delay:750ms]'>
            Yes — Saturdays from 9:00 to 14:00. Walk-ins are welcome.
          </AssistantBubble>
          <VisitorBubble className='lp-rise [--lp-delay:1150ms]'>
            Could someone send me a quote for a group of 12? I&apos;m Maya, maya.chen@mail.com
          </VisitorBubble>
          <AssistantBubble className='lp-rise [--lp-delay:1550ms]'>
            Thanks, Maya. I&apos;ve passed this to the team — a person will reply here shortly.
          </AssistantBubble>
        </WidgetFrame>

        <div className='relative mt-5 lg:absolute lg:-right-2 lg:-bottom-[13.5rem] lg:mt-0 lg:w-[330px] xl:-right-10'>
          <SideLabel className='mb-3 ml-auto flex w-fit'>
            <Icons.galleryVerticalEnd className='size-3.5' />
            What you receive
          </SideLabel>
          <InboxCard
            who='Maya Chen'
            initials='MC'
            meta='maya.chen@mail.com'
            message='Could someone send me a quote for a group of 12?'
            tones={['lead', 'handoff']}
            className='lp-rise lp-bob [--lp-delay:1900ms] [--lp-tilt:1.5deg] rotate-[1.5deg] sm:mx-6 lg:mx-0'
          />
        </div>
      </div>
      <p className='text-lp-muted relative z-10 mt-4 flex items-center gap-1.5 text-xs font-semibold lg:absolute lg:-bottom-[15rem] lg:left-1 lg:max-w-[220px]'>
        <Icons.info className='size-3.5' aria-hidden='true' />
        Example conversation for illustration — not a live chat.
      </p>
    </div>
  );
}
