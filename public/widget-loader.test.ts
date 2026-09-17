// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { waitFor } from '@testing-library/react';

/**
 * Focused regression coverage for the public 'ai-receptionist:open'
 * event contract documented at the top of widget-loader.js.
 *
 * This is plain, dependency-free browser JavaScript, not a module —
 * it's never imported anywhere, it self-executes as an IIFE reading
 * `document.currentScript`. To test it as written (rather than
 * rewriting it as an importable module, which would defeat the "no
 * bundler assumed" design constraint), each test appends a fresh
 * `<script src="..." data-widget-id="...">` tag and evaluates the raw
 * source with `new Function(...)()` — the same trick real browsers
 * effectively perform when they execute a `<script src>` tag, with
 * `document.currentScript` unset so the script's own documented
 * fallback ("the last <script> in the document") picks up our tag.
 */

const WIDGET_SOURCE = readFileSync(path.resolve(__dirname, 'widget-loader.js'), 'utf8');
const PLATFORM_ORIGIN = 'https://platform.example';
const OPEN_EVENT_NAME = 'ai-receptionist:open';
const HOST_ID = 'ai-receptionist-widget-root';

let widgetIdCounter = 0;
/**
 * A fresh id per test. Executing the loader script attaches a new
 * `window` listener each time (there's no module system to reset
 * between tests), so previous tests' listeners can linger — giving
 * each test its own id means any stale listener's widgetId comparison
 * simply never matches, so it can't interfere.
 */
function uniqueWidgetId(): string {
  widgetIdCounter += 1;
  return `11111111-1111-4111-8${widgetIdCounter.toString().padStart(3, '0')}-100000000000`;
}

interface FetchScenario {
  configOk?: boolean;
  configData?: Record<string, unknown>;
  configRejects?: boolean;
  sessionData?: Record<string, unknown>;
}

function jsonResponse(data: unknown, ok: boolean) {
  return Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(data) });
}

const DEFAULT_CONFIG = {
  enabled: true,
  title: 'Test Widget',
  position: 'bottom-right',
  primaryColor: '#1677ff'
};
const DEFAULT_SESSION = {
  enabled: true,
  conversationId: 'conv-1',
  sessionToken: 'tok-1',
  messages: []
};

/** A config fetch this test controls the resolution timing of, to simulate "still initializing". */
function installControllableFetchMock() {
  let resolveConfig!: (value: unknown) => void;
  const configPromise = new Promise((resolve) => {
    resolveConfig = resolve;
  });

  const fetchMock = vi.fn((url: string) => {
    if (url.includes('/api/public-widget/config')) return configPromise;
    if (url.includes('/api/public-widget/session')) return jsonResponse(DEFAULT_SESSION, true);
    return jsonResponse({ messages: [] }, true);
  });
  vi.stubGlobal('fetch', fetchMock);

  return {
    fetchMock,
    resolveConfigWith(data: unknown, ok = true) {
      resolveConfig({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(data) });
    },
    rejectConfig(error: unknown) {
      resolveConfig(Promise.reject(error));
    }
  };
}

function installFetchMock(scenario: FetchScenario = {}) {
  const fetchMock = vi.fn((url: string) => {
    if (url.includes('/api/public-widget/config')) {
      if (scenario.configRejects) return Promise.reject(new Error('network down'));
      return jsonResponse(scenario.configData ?? DEFAULT_CONFIG, scenario.configOk ?? true);
    }
    if (url.includes('/api/public-widget/session')) {
      return jsonResponse(scenario.sessionData ?? DEFAULT_SESSION, true);
    }
    return jsonResponse({ messages: [] }, true);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function loadWidgetScript(widgetId: string, src = `${PLATFORM_ORIGIN}/widget-loader.js`) {
  const script = document.createElement('script');
  script.src = src;
  script.setAttribute('data-widget-id', widgetId);
  document.body.appendChild(script);
  new Function(WIDGET_SOURCE)();
}

function getHost(): HTMLElement | null {
  return document.getElementById(HOST_ID);
}

function getShadow(): ShadowRoot {
  const host = getHost();
  if (!host || !host.shadowRoot) throw new Error('widget did not mount');
  return host.shadowRoot;
}

function isOpen(): boolean {
  const panel = getShadow().querySelector('.panel');
  return !!panel && panel.classList.contains('open');
}

function dispatchOpenEvent(widgetId: unknown) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT_NAME, { detail: { widgetId } }));
}

async function waitForMount() {
  await waitFor(() => {
    expect(getHost()).not.toBeNull();
  });
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('ai-receptionist:open — matching and mismatched ids', () => {
  it('opens the widget when the event carries the exact matching widgetId', async () => {
    const widgetId = uniqueWidgetId();
    installFetchMock();
    loadWidgetScript(widgetId);
    await waitForMount();

    expect(isOpen()).toBe(false);
    dispatchOpenEvent(widgetId);

    expect(isOpen()).toBe(true);
  });

  it('does nothing when the event carries a different widgetId', async () => {
    const widgetId = uniqueWidgetId();
    installFetchMock();
    loadWidgetScript(widgetId);
    await waitForMount();

    dispatchOpenEvent(uniqueWidgetId());

    expect(isOpen()).toBe(false);
  });
});

describe('ai-receptionist:open — missing or malformed detail', () => {
  it('ignores a plain Event with no detail at all', async () => {
    const widgetId = uniqueWidgetId();
    installFetchMock();
    loadWidgetScript(widgetId);
    await waitForMount();

    window.dispatchEvent(new Event(OPEN_EVENT_NAME));

    expect(isOpen()).toBe(false);
  });

  it('ignores a CustomEvent with a null detail', async () => {
    const widgetId = uniqueWidgetId();
    installFetchMock();
    loadWidgetScript(widgetId);
    await waitForMount();

    window.dispatchEvent(new CustomEvent(OPEN_EVENT_NAME, { detail: null }));

    expect(isOpen()).toBe(false);
  });

  it('ignores a CustomEvent whose detail is missing widgetId', async () => {
    const widgetId = uniqueWidgetId();
    installFetchMock();
    loadWidgetScript(widgetId);
    await waitForMount();

    window.dispatchEvent(new CustomEvent(OPEN_EVENT_NAME, { detail: {} }));

    expect(isOpen()).toBe(false);
  });

  it('ignores a CustomEvent whose widgetId is not a string', async () => {
    const widgetId = uniqueWidgetId();
    installFetchMock();
    loadWidgetScript(widgetId);
    await waitForMount();

    dispatchOpenEvent(12345);

    expect(isOpen()).toBe(false);
  });
});

describe('ai-receptionist:open — arrives while still initializing', () => {
  it('opens automatically right after initialization succeeds', async () => {
    const widgetId = uniqueWidgetId();
    const control = installControllableFetchMock();
    loadWidgetScript(widgetId);

    // Config hasn't resolved yet — nothing has mounted.
    expect(getHost()).toBeNull();
    dispatchOpenEvent(widgetId);
    expect(getHost()).toBeNull();

    control.resolveConfigWith(DEFAULT_CONFIG);
    await waitForMount();

    expect(isOpen()).toBe(true);
  });

  it('a config failure discards the pending open — nothing is ever shown', async () => {
    const widgetId = uniqueWidgetId();
    const control = installControllableFetchMock();
    loadWidgetScript(widgetId);

    dispatchOpenEvent(widgetId);
    control.resolveConfigWith(null, false);

    // Give the rejected/failed chain every chance to (wrongly) mount something.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(getHost()).toBeNull();

    // And the discarded pending flag must not resurrect itself if
    // something else ever called mountWidget after the fact — there is
    // no such path here, but a later matching event must also still be
    // correctly ignored (initialization never succeeded, ever).
    dispatchOpenEvent(widgetId);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(getHost()).toBeNull();
  });

  it('the widget being disabled discards the pending open', async () => {
    const widgetId = uniqueWidgetId();
    const control = installControllableFetchMock();
    loadWidgetScript(widgetId);

    dispatchOpenEvent(widgetId);
    control.resolveConfigWith({ enabled: false });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(getHost()).toBeNull();
  });

  it('a rejected config fetch (network failure / origin denial) discards the pending open', async () => {
    const widgetId = uniqueWidgetId();
    const control = installControllableFetchMock();
    loadWidgetScript(widgetId);

    dispatchOpenEvent(widgetId);
    control.rejectConfig(new Error('origin not allowed'));

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(getHost()).toBeNull();
  });
});

describe('idempotency', () => {
  it('repeated open events while already open do not duplicate the UI', async () => {
    const widgetId = uniqueWidgetId();
    installFetchMock();
    loadWidgetScript(widgetId);
    await waitForMount();

    dispatchOpenEvent(widgetId);
    dispatchOpenEvent(widgetId);
    dispatchOpenEvent(widgetId);

    expect(document.querySelectorAll(`#${HOST_ID}`)).toHaveLength(1);
    expect(isOpen()).toBe(true);
  });

  it('closing and dispatching another event reopens it', async () => {
    const widgetId = uniqueWidgetId();
    installFetchMock();
    loadWidgetScript(widgetId);
    await waitForMount();

    dispatchOpenEvent(widgetId);
    expect(isOpen()).toBe(true);

    // Closing is exercised through the widget's own close button here
    // purely to verify internal state — see the "no Shadow DOM" test
    // below for what a customer's own page actually has to do (nothing
    // but dispatch the event).
    const closeButton = getShadow().querySelector<HTMLButtonElement>('.close')!;
    closeButton.click();
    expect(isOpen()).toBe(false);

    dispatchOpenEvent(widgetId);
    expect(isOpen()).toBe(true);
  });
});

describe('the launcher button', () => {
  it('still opens the widget when clicked directly', async () => {
    const widgetId = uniqueWidgetId();
    installFetchMock();
    loadWidgetScript(widgetId);
    await waitForMount();

    const launcher = getShadow().querySelector<HTMLButtonElement>('.launcher')!;
    launcher.click();

    expect(isOpen()).toBe(true);
  });
});

describe('no Shadow DOM access required by the customer website', () => {
  it('opens purely via window.dispatchEvent — no shadowRoot or internal selector needed', async () => {
    const widgetId = uniqueWidgetId();
    installFetchMock();
    loadWidgetScript(widgetId);
    await waitForMount();

    // This is the entire "customer website" side of the contract: one
    // call, no DOM traversal, no knowledge of .launcher/.panel/shadow
    // roots or any other internal implementation detail.
    window.dispatchEvent(new CustomEvent(OPEN_EVENT_NAME, { detail: { widgetId } }));

    expect(isOpen()).toBe(true);
  });
});

describe('no leaked business/session data', () => {
  it('the loader source never reads businessId, session tokens, or secrets off the open event', () => {
    expect(WIDGET_SOURCE).not.toMatch(/detail\.(businessId|sessionToken|secret)/i);
  });

  it('config and session responses carrying sensitive-looking fields never surface anywhere in the DOM or on window', async () => {
    const widgetId = uniqueWidgetId();
    installFetchMock({
      configData: {
        ...DEFAULT_CONFIG,
        businessId: 'biz-should-never-appear',
        internalSecret: 'sk_live_should_never_appear'
      },
      sessionData: {
        ...DEFAULT_SESSION,
        businessId: 'biz-should-never-appear',
        internalSecret: 'sk_live_should_never_appear'
      }
    });
    loadWidgetScript(widgetId);
    await waitForMount();

    dispatchOpenEvent(widgetId);
    await waitFor(() => expect(isOpen()).toBe(true));
    // ensureSession() runs asynchronously after opening; let it settle.
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(document.body.innerHTML).not.toContain('biz-should-never-appear');
    expect(document.body.innerHTML).not.toContain('sk_live_should_never_appear');
    expect(getShadow().innerHTML).not.toContain('biz-should-never-appear');
    expect(getShadow().innerHTML).not.toContain('sk_live_should_never_appear');
    expect((window as unknown as Record<string, unknown>).businessId).toBeUndefined();
    expect((window as unknown as Record<string, unknown>).internalSecret).toBeUndefined();
  });

  it('a caller only ever needs to send widgetId — no other field is read from detail', async () => {
    const widgetId = uniqueWidgetId();
    installFetchMock();
    loadWidgetScript(widgetId);
    await waitForMount();

    // Extra fields on detail are simply irrelevant noise, not something
    // the widget trusts or reads — matching widgetId is sufficient and
    // necessary on its own.
    window.dispatchEvent(
      new CustomEvent(OPEN_EVENT_NAME, {
        detail: { widgetId, businessId: 'ignored', sessionToken: 'ignored', anything: 'ignored' }
      })
    );

    expect(isOpen()).toBe(true);
  });
});
