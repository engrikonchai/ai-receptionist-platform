'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/icons';

const COPY_RESET_DELAY_MS = 2000;

/**
 * Builds the exact `<script>` tag an owner pastes onto their own site.
 * `siteOrigin` is this platform's own canonical origin (see
 * src/lib/site-url.ts) — the loader script it points at
 * (`/widget-loader.js`, a public static file, see
 * public/widget-loader.js) renders the whole chat UI itself, inside a
 * Shadow DOM host it injects directly into the third-party page (no
 * separate widget page/route to load), and talks only to the real
 * widget runtime through this platform's own src/app/api/public-widget/*
 * endpoints — never a fake/example URL.
 */
export function buildInstallSnippet(siteOrigin: string, publicWidgetId: string): string {
  return `<script src="${siteOrigin}/widget-loader.js" data-widget-id="${publicWidgetId}" async></script>`;
}

/**
 * The documented public contract for opening the widget from a
 * customer's own button (see the "Public 'open from your own button'
 * contract" section in public/widget-loader.js) — never Shadow DOM
 * access, never an internal class name, just this one event.
 */
export function buildOpenEventSnippet(publicWidgetId: string): string {
  return `document.querySelector('#your-button').addEventListener('click', function () {
  window.dispatchEvent(
    new CustomEvent('ai-receptionist:open', {
      detail: { widgetId: '${publicWidgetId}' }
    })
  );
});`;
}

export function InstallSnippetCard({
  siteOrigin,
  publicWidgetId
}: {
  siteOrigin: string;
  publicWidgetId: string;
}) {
  const [copied, setCopied] = useState(false);
  const snippet = buildInstallSnippet(siteOrigin, publicWidgetId);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_RESET_DELAY_MS);
    } catch {
      // Clipboard access can be denied (permissions, insecure context) —
      // the code is still fully visible and selectable in the <pre>
      // below, so this is a silent, non-blocking fallback.
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Install on your website</CardTitle>
        <CardDescription>Your public widget ID</CardDescription>
        <p className='bg-muted text-foreground max-w-full rounded-md px-2 py-1 font-mono text-sm break-all'>
          {publicWidgetId}
        </p>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='space-y-2'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <span className='text-sm font-medium'>Installation code</span>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={handleCopy}
              className='h-9 px-3'
            >
              {copied ? (
                <>
                  <Icons.check className='size-3.5' aria-hidden='true' />
                  Copied
                </>
              ) : (
                <>
                  <Icons.copy className='size-3.5' aria-hidden='true' />
                  Copy code
                </>
              )}
            </Button>
          </div>
          <pre className='bg-muted max-w-full overflow-x-auto rounded-md p-3 text-xs'>
            <code>{snippet}</code>
          </pre>
        </div>

        <ol className='text-muted-foreground list-decimal space-y-1.5 pl-4 text-sm'>
          <li>
            Copy the installation code above and paste it just before the closing{' '}
            <code className='bg-muted rounded px-1 py-0.5 text-xs'>{'</body>'}</code> tag of your
            website&apos;s HTML.
          </li>
          <li>Publish/deploy your website.</li>
          <li>Open your live site as a visitor and try the chat button in the corner.</li>
        </ol>

        <p className='text-muted-foreground text-xs'>
          The widget only responds on domains you&apos;ve allowed below — add your website&apos;s
          domain there first, or the chat button won&apos;t reply to visitors.
        </p>

        <details className='group'>
          <summary className='text-sm font-medium hover:cursor-pointer'>
            Optional: open the widget from your own button
          </summary>
          <div className='mt-2 space-y-2'>
            <p className='text-muted-foreground text-xs'>
              Want a &quot;Chat with us&quot; button of your own, instead of (or alongside) the
              floating launcher? Dispatch this event from its click handler — no need to find or
              touch the widget&apos;s own elements.
            </p>
            <pre className='bg-muted max-w-full overflow-x-auto rounded-md p-3 text-xs'>
              <code>{buildOpenEventSnippet(publicWidgetId)}</code>
            </pre>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
