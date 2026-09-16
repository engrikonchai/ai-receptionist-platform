/**
 * Where the real chat runtime (ChatbotDemo's own `/api/widget/*` Route
 * Handlers — session creation, message turns, Supabase persistence, the
 * chat engine) is actually deployed. Server-only: the public widget
 * proxy (src/app/api/public-widget/*) is the only thing that calls this
 * origin, and it does so with a plain server-to-server fetch, never
 * exposed to the browser — a visitor's browser only ever talks to this
 * platform's own origin.
 *
 * Deliberately not `NEXT_PUBLIC_*`: nothing in the browser needs to know
 * this URL, and keeping it server-only means it can be changed (e.g.
 * ChatbotDemo moving hosts) without touching any client bundle.
 */
export function getChatRuntimeOrigin(): string | null {
  const origin = process.env.CHAT_RUNTIME_ORIGIN;
  if (!origin) return null;
  return origin.endsWith('/') ? origin.slice(0, -1) : origin;
}

export function isChatRuntimeConfigured(): boolean {
  return getChatRuntimeOrigin() !== null;
}

export const CHAT_RUNTIME_MISSING_MESSAGE =
  "The chat assistant isn't available right now. Please try again shortly.";
