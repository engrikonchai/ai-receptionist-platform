import type { Metadata } from 'next';
import { DemoExperience } from '@/features/demo/components/demo-experience';
import { DemoHeader } from '@/features/demo/components/demo-header';

export const metadata: Metadata = {
  title: 'Try the demo — Platform',
  description:
    'A scripted, interactive example of the website chat widget — pick an example business and try asking a question. No signup, nothing saved.'
};

/**
 * Public, unauthenticated route — deliberately outside the
 * `(marketing)` route group and outside `dashboard/`, so `proxy.ts`'s
 * matcher never touches it and it needs no owner-context check. See
 * docs/daylight-design-system.md for the shared `.daylight-marketing`
 * scoping this page reuses.
 */
export default function DemoPage() {
  return (
    <div id='demo-root' className='daylight-marketing flex min-h-svh flex-col'>
      <DemoHeader />
      <main className='flex-1'>
        <DemoExperience />
      </main>
    </div>
  );
}
