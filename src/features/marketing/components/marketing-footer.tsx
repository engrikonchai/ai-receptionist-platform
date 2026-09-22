import { Icons } from '@/components/icons';

/**
 * The three "PRODUCT" items below are plain descriptive text, not
 * links — the approved export shows them as a static label list with
 * no href, and none of them maps to a single dedicated on-page anchor,
 * so rendering them as `<a>` tags would risk exactly the "decorative
 * dead link" this milestone must avoid. Real navigation lives only in
 * the header (see nav-links.ts).
 */
const PRODUCT_ITEMS = ['Chat widget', 'Inbox', 'Knowledge Base'];

export function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className='bg-daylight-navy-deep px-5 py-12 sm:px-8 sm:py-16 lg:px-12'>
      <div className='mx-auto grid max-w-7xl gap-10 sm:grid-cols-[1.6fr_1fr]'>
        <div>
          <span className='inline-flex items-center gap-2'>
            <Icons.logo className='text-daylight-indigo size-6' aria-hidden='true' />
            <span className='text-lg font-extrabold text-white'>Platform</span>
          </span>
          <p className='text-daylight-muted mt-3.5 max-w-70 text-sm leading-relaxed'>
            Website chat that answers customers, captures leads and brings in a person when it
            matters.
          </p>
        </div>
        <div className='flex flex-col gap-2.5'>
          <span className='text-daylight-on-navy-faint text-xs font-bold tracking-[0.12em] uppercase'>
            Product
          </span>
          {PRODUCT_ITEMS.map((item) => (
            <span key={item} className='text-daylight-on-navy-body text-sm'>
              {item}
            </span>
          ))}
        </div>
      </div>
      <div className='border-daylight-navy-panel text-daylight-on-navy-faint mx-auto mt-10 max-w-7xl border-t pt-5 text-sm'>
        © {year} Platform
      </div>
    </footer>
  );
}
