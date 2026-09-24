import type { Metadata } from 'next';
import { Fraunces } from 'next/font/google';
import { MarketingHeader } from '@/features/marketing/components/marketing-header';
import { MarketingFooter } from '@/features/marketing/components/marketing-footer';

/**
 * Fraunces is only used by the landing page, so it is loaded here rather
 * than in the shared font config (which is applied to every route).
 */
const fontFraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  axes: ['SOFT', 'opsz'],
  style: ['normal', 'italic']
});

/**
 * The public marketing shell — currently just `/`. `.daylight-marketing`
 * (src/styles/daylight.css) keeps the shared Daylight tokens available,
 * and `.landing` (src/styles/landing.css) layers the landing page's own
 * "Sunroom" look on top; both are scoped to this subtree, so
 * `/dashboard/*`, `/demo` and the auth routes never see the new tokens.
 *
 * Absolute title (not the root layout's `%s | Platform` template) so
 * the landing page gets one clean, complete title.
 */
export const metadata: Metadata = {
  title: {
    absolute: 'Platform — an AI assistant that answers your customers'
  },
  description:
    'Teach an AI assistant about your business once. It answers visitors on your website, captures leads, and hands off to you when a person is needed.'
};

/**
 * `id` gives the mobile nav's Sheet portal a same-subtree DOM node to
 * render into (see mobile-nav.tsx) — without it, Base UI's Dialog
 * portal appends to `document.body` by default, which sits OUTSIDE
 * `.daylight-marketing` and would silently strip every token/utility
 * class from the portaled panel.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      id='daylight-marketing-root'
      className={`daylight-marketing landing ${fontFraunces.variable} flex min-h-svh flex-col`}
    >
      <MarketingHeader />
      <main className='overflow-x-clip'>{children}</main>
      <MarketingFooter />
    </div>
  );
}
