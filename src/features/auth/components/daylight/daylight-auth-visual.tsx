import { Icons } from '@/components/icons';

const VALUE_PROPS = ['Website chat widget', 'Your business Inbox', 'Human handoff'] as const;

/**
 * The desktop-only "expressive but controlled" supporting visual
 * (Milestone 3's "Authentication layout" requirement) — echoes the
 * real hero copy/bullets from the landing page (never invented
 * claims), plus one small illustrative conversation snippet in the
 * same visual language as the landing page's ProductPreview. Hidden
 * entirely below `lg` so it never competes with the form on mobile.
 */
export function DaylightAuthVisual() {
  return (
    <div className='bg-daylight-navy relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12'>
      <div
        aria-hidden='true'
        className='bg-daylight-navy-panel pointer-events-none absolute -top-24 -right-24 size-80 rounded-full opacity-60 blur-3xl'
      />
      <div
        aria-hidden='true'
        className='bg-daylight-indigo pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full opacity-20 blur-3xl'
      />

      <div className='relative'>
        <h2 className='max-w-sm text-[34px] leading-[1.12] font-extrabold tracking-[-0.03em] text-white'>
          Every customer gets an answer.
        </h2>
        <ul className='mt-7 flex flex-col gap-3.5'>
          {VALUE_PROPS.map((item) => (
            <li key={item} className='flex items-center gap-2.5 text-[15px] font-semibold'>
              <span
                aria-hidden='true'
                className='bg-daylight-indigo flex size-5.5 shrink-0 items-center justify-center rounded-full'
              >
                <Icons.check className='size-3.5 text-white' />
              </span>
              <span className='text-daylight-on-navy-body'>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div
        aria-hidden='true'
        className='rounded-daylight-card shadow-daylight-lg relative mt-10 flex max-w-sm flex-col gap-2.5 bg-white p-5'
      >
        <p className='rounded-tl-2xl rounded-tr-2xl rounded-br-2xl rounded-bl-sm bg-daylight-surface-muted text-daylight-ink px-4 py-2.5 text-sm leading-relaxed'>
          Are you open on Saturdays?
        </p>
        <p className='bg-daylight-indigo rounded-tl-2xl rounded-tr-2xl rounded-br-sm rounded-bl-2xl px-4 py-2.5 text-sm leading-relaxed text-white ltr:ml-auto rtl:mr-auto'>
          Yes — Saturdays from 9:00 to 14:00.
        </p>
      </div>
    </div>
  );
}
