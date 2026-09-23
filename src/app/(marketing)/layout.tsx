import type { Metadata } from 'next';
import { MarketingHeader } from '@/features/marketing/components/marketing-header';
import { MarketingFooter } from '@/features/marketing/components/marketing-footer';

/**
 * The public Daylight marketing shell — currently just `/`, and the
 * future home for Milestone 2's interactive demo route. `.daylight-marketing`
 * (src/styles/daylight.css) scopes every Daylight token to this
 * subtree only; `/dashboard/*` and every auth route render under the
 * root layout's plain `<body>` and never see these tokens or fonts.
 *
 * Absolute title (not the root layout's `%s | Platform` template) so
 * the landing page gets one clean, complete title rather than
 * "… | Platform" — the root layout's default still applies to every
 * other route that doesn't set its own title.
 */
export const metadata: Metadata = {
  title: {
    absolute: 'Platform — website chat for every business'
  },
  description:
    'Answer common questions, capture leads, and hand off to a person when it matters — one website chat widget and business Inbox for any business.'
};

/**
 * `id` gives the mobile nav's Sheet portal a same-subtree DOM node to
 * render into (see mobile-nav.tsx) — without it, Base UI's Dialog
 * portal appends to `document.body` by default, which sits OUTSIDE
 * `.daylight-marketing` and would silently strip every `daylight-*`
 * token/utility class from the portaled panel.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div id='daylight-marketing-root' className='daylight-marketing flex min-h-svh flex-col'>
      <MarketingHeader />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  );
}
