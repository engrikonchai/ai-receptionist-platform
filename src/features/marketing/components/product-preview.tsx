import { Icons } from '@/components/icons';

/**
 * The approved six-step product story (Landing Page.dc.html's hero
 * visual), rebuilt as static markup — fictional content only, no
 * network calls, no auth, no real widget/Inbox code reused. A clean
 * boundary Milestone 2 can replace or extend with the real
 * multi-industry interactive demo without touching the rest of the
 * landing page.
 *
 * Steps: 1 widget opens · 2 visitor asks a question · 3 reply comes
 * from the Knowledge Base · 4 lead details are captured · 5 handed to
 * a person · 6 conversation appears in the Inbox.
 */
function StepBadge({ n, tone = 'light' }: { n: number; tone?: 'light' | 'solid' }) {
  return (
    <span
      aria-hidden='true'
      className={
        tone === 'solid'
          ? 'bg-daylight-indigo inline-flex size-5.5 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-white'
          : 'bg-daylight-indigo-tint text-daylight-indigo inline-flex size-5.5 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold'
      }
    >
      {n}
    </span>
  );
}

/** Stagger index for the entrance animation (see `.daylight-step` in daylight.css). */
function stepStyle(i: number) {
  return { '--step': i } as React.CSSProperties;
}

export function ProductPreview() {
  return (
    <div
      aria-label='Example product preview: how a conversation moves from the website widget to your Inbox — not a live conversation'
      className='flex flex-col gap-3.5'
    >
      <div className='rounded-daylight-card shadow-daylight-lg overflow-hidden bg-white'>
        <div className='bg-daylight-indigo flex items-center gap-3 px-5 py-4'>
          <StepBadge n={1} tone='light' />
          <div className='text-daylight-indigo flex size-8.5 items-center justify-center rounded-[11px] bg-white text-[13px] font-extrabold'>
            NS
          </div>
          <div>
            <p className='text-[15px] font-bold text-white'>Northside Studio</p>
            <p className='text-daylight-on-indigo-muted text-[12px]'>
              Website chat · Example conversation
            </p>
          </div>
        </div>

        <div className='flex flex-col gap-3 px-5 py-5'>
          <div style={stepStyle(0)} className='daylight-step flex items-start gap-3'>
            <StepBadge n={2} />
            <p className='rounded-tl-2xl rounded-tr-2xl rounded-br-sm rounded-bl-2xl bg-daylight-indigo px-4 py-2.5 text-sm leading-relaxed text-white ltr:ml-auto rtl:mr-auto'>
              Are you open on Saturdays?
            </p>
          </div>

          <div style={stepStyle(1)} className='daylight-step flex items-start gap-3'>
            <StepBadge n={3} />
            <div className='flex max-w-90 flex-col gap-1.5'>
              <p className='bg-daylight-surface-muted text-daylight-ink rounded-tl-2xl rounded-tr-2xl rounded-br-2xl rounded-bl-sm px-4 py-2.5 text-sm leading-relaxed'>
                Yes — Saturdays from 9:00 to 14:00. Walk-ins are welcome, but booking ahead is
                recommended.
              </p>
              <span className='text-daylight-muted text-xs font-semibold'>
                Answered from Knowledge Base · Opening hours
              </span>
            </div>
          </div>

          <div style={stepStyle(2)} className='daylight-step flex items-start gap-3'>
            <span aria-hidden='true' className='size-5.5 shrink-0' />
            <p className='rounded-tl-2xl rounded-tr-2xl rounded-br-sm rounded-bl-2xl bg-daylight-indigo px-4 py-2.5 text-sm leading-relaxed text-white ltr:ml-auto rtl:mr-auto'>
              Could someone send me a quote for a group of 12? I&apos;m Maya — maya.chen@mail.com
            </p>
          </div>

          <div style={stepStyle(3)} className='daylight-step flex items-center gap-3'>
            <StepBadge n={4} />
            <p className='bg-daylight-success-tint text-daylight-success rounded-daylight-control flex flex-wrap items-center gap-2 px-3.5 py-2.5 text-[13px] font-semibold'>
              <span className='font-extrabold'>Lead captured</span>
              <span>Maya Chen · maya.chen@mail.com · Group quote</span>
            </p>
          </div>

          <div style={stepStyle(4)} className='daylight-step flex items-center gap-3'>
            <StepBadge n={5} />
            <p className='bg-daylight-surface-muted text-daylight-ink rounded-tl-2xl rounded-tr-2xl rounded-br-2xl rounded-bl-sm px-4 py-2.5 text-sm leading-relaxed'>
              Thanks, Maya. I&apos;ve passed this to the team — a person will reply here shortly.
            </p>
          </div>
        </div>
      </div>

      <div
        style={stepStyle(5)}
        className='daylight-step rounded-daylight-card shadow-daylight-md flex items-start gap-3.5 bg-white p-5.5'
      >
        <StepBadge n={6} tone='solid' />
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2.5'>
            <span className='text-daylight-muted text-xs font-bold tracking-[0.12em] uppercase'>
              Your Inbox
            </span>
            <span className='text-daylight-muted ml-auto text-xs'>just now</span>
          </div>
          <div className='mt-3 flex items-center gap-2.5'>
            <div className='bg-daylight-indigo-tint text-daylight-indigo flex size-8.5 items-center justify-center rounded-[11px] text-xs font-extrabold'>
              MC
            </div>
            <p className='text-daylight-ink text-[15px] font-bold'>Maya Chen</p>
            <div className='ml-auto flex flex-wrap gap-1.5'>
              <span className='bg-daylight-success-tint text-daylight-success rounded-full px-3 py-1.5 text-xs font-bold'>
                Lead captured
              </span>
              <span className='bg-daylight-danger-tint text-daylight-danger rounded-full px-3 py-1.5 text-xs font-bold'>
                Handed off
              </span>
            </div>
          </div>
          <p className='font-daylight-serif text-daylight-ink mt-3 text-base leading-relaxed'>
            &ldquo;Could someone send me a quote for a group of 12?&rdquo;
          </p>
        </div>
      </div>
      <p className='text-daylight-muted flex items-center gap-1.5 text-xs font-semibold'>
        <Icons.info className='size-3.5' aria-hidden='true' />
        Example conversation for illustration — not a live chat.
      </p>
    </div>
  );
}
