import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  conversationHandoffOptions,
  conversationLeadOptions,
  conversationMessagesOptions,
  conversationsOptions,
  inboxKeys
} from './queries';

/**
 * Regression coverage for the production 500 on /dashboard/inbox:
 * "Attempted to call conversationsOptions() from the server but
 * conversationsOptions is on the client." Root cause was a `'use
 * client'` directive on this module — it turned every export,
 * `conversationsOptions` included, into an opaque client reference,
 * which src/app/dashboard/inbox/page.tsx (a Server Component) cannot
 * call as a plain function. `next build` never caught it because
 * /dashboard/inbox is fully dynamic and isn't rendered at build time —
 * it only broke on a real, authenticated request. Vitest doesn't
 * enforce Next's Server/Client Component boundary itself, so these
 * tests guard the two things that actually matter: the directive never
 * comes back on the module used for server-side prefetching, and the
 * page that prefetches it never "fixes" this by becoming a Client
 * Component instead.
 */

const USE_CLIENT_DIRECTIVE = /^\s*['"]use client['"]/;

describe('inbox query-options module stays a neutral, server-callable module', () => {
  it("src/features/inbox/api/queries.ts never carries 'use client'", () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/features/inbox/api/queries.ts'),
      'utf-8'
    );
    expect(source).not.toMatch(USE_CLIENT_DIRECTIVE);
  });

  it("src/app/dashboard/inbox/page.tsx stays a Server Component — the fix must never be adding 'use client' to the page", () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/app/dashboard/inbox/page.tsx'),
      'utf-8'
    );
    expect(source).not.toMatch(USE_CLIENT_DIRECTIVE);
    // The page must still prefetch through this exact module, not a
    // client-only duplicate — otherwise the boundary check above is
    // guarding a module the page no longer uses.
    expect(source).toMatch(/from '@\/features\/inbox\/api\/queries'/);
  });

  it('conversationsOptions() is callable as a plain, synchronous function — exactly how a Server Component prefetch call invokes it', () => {
    // This is the literal call site from page.tsx:
    //   await queryClient.fetchQuery(conversationsOptions(activeBusinessId));
    // If `./queries` were a client module, this call alone throws in a
    // real Next.js server render — the bug this test guards against.
    const options = conversationsOptions('biz-1');
    expect(options.queryKey).toEqual(inboxKeys.conversations('biz-1'));
    expect(typeof options.queryFn).toBe('function');
  });

  it('produces identical, stable query keys for server-side prefetching and client-side hydration', () => {
    const forServerPrefetch = conversationsOptions('biz-1').queryKey;
    const forClientHydration = conversationsOptions('biz-1').queryKey;
    expect(forServerPrefetch).toEqual(forClientHydration);

    const messagesA = conversationMessagesOptions('biz-1', 'conv-1').queryKey;
    const messagesB = conversationMessagesOptions('biz-1', 'conv-1').queryKey;
    expect(messagesA).toEqual(messagesB);
    expect(messagesA).toEqual(inboxKeys.messages('biz-1', 'conv-1'));
  });

  it('every conversation-scoped options factory keys under the same business id as the list', () => {
    const conversationsKey = inboxKeys.conversations('biz-1');
    const leadKey = conversationLeadOptions('biz-1', 'conv-1').queryKey;
    const handoffKey = conversationHandoffOptions('biz-1', 'conv-1').queryKey;

    expect(leadKey.slice(0, 2)).toEqual(conversationsKey.slice(0, 2));
    expect(handoffKey.slice(0, 2)).toEqual(conversationsKey.slice(0, 2));
  });
});
