# Daylight design system

**Bold and expressive outside; calm and efficient inside.**

Daylight is the approved public marketing visual direction for the landing page
(`/`, and the future interactive-demo route). It is deliberately **not** the
dashboard's visual system — **the dashboard has not been migrated to Daylight
and is not in scope for this milestone.** The dashboard keeps its existing
Zen theme (`src/styles/themes/zen.css`) untouched.

Source of truth: the approved Claude Design export (`Handoff.dc.html`,
`Design System.dc.html`, `Landing Page.dc.html`). That export is a
developer-handoff reference only — it was never committed to this repository
and was not pasted into production code. Every value below was rebuilt as
real Next.js/Tailwind/TypeScript, matching the export's values exactly.
`Visual Directions.dc.html` (archived exploration, obsolete phone-based
content) and `support.js` were explicitly excluded from implementation.

## Public-versus-dashboard strategy

One repository, two visual systems, cleanly separated:

- **Public marketing** (`/`, wrapped by `src/app/(marketing)/layout.tsx`) —
  Daylight: Manrope + Libre Baskerville, indigo brand, light canvas.
- **Authenticated dashboard** (`/dashboard/*` and every other route) — Zen,
  unchanged, using the existing shadcn tokens (`--background`, `--primary`,
  etc.) from `src/styles/themes/zen.css`.

They share one Next.js root layout (`src/app/layout.tsx`) and one `<body>`,
so the separation is enforced by **scoping**, not by two different apps.

## Scoped token architecture

All Daylight tokens live in `src/styles/daylight.css`, under a single
selector: `.daylight-marketing`. That class is applied exactly once, on the
marketing layout's root element (`src/app/(marketing)/layout.tsx`).

```css
.daylight-marketing {
  --daylight-ink: #1b1f3b;
  --daylight-indigo: #4b57c9;
  /* … every other token … */

  @theme inline {
    --color-daylight-ink: var(--daylight-ink);
    --color-daylight-indigo: var(--daylight-indigo);
    /* … */
  }
}
```

The nested `@theme inline` block is what makes Tailwind v4 generate real
utility classes (`bg-daylight-indigo`, `text-daylight-ink`,
`font-daylight-serif`, `rounded-daylight-card`, `shadow-daylight-md`, …) —
the exact mechanism `zen.css` already uses to generate `bg-primary`,
`font-sans`, etc. under `[data-theme='zen']`. Those `daylight-*` utility
classes exist globally (any component can reference them), but they only
resolve to a real value where `.daylight-marketing` is an ancestor in the
DOM. Used outside that scope, they render nothing — a visible signal during
development, never a silent restyle of the dashboard.

**Nothing in this milestone edits `zen.css`, `[data-theme='zen']`, `:root`,
or any of the dashboard's existing `--background`/`--primary`/etc. tokens.**
The dashboard's own components never reference a `daylight-*` class.

### Portals and the scoping boundary

A component that portals to `document.body` (a `Sheet`/`Dialog`) escapes
`.daylight-marketing`'s DOM subtree even though it's still inside the React
tree — and with it, every `daylight-*` class silently stops resolving. The
mobile nav (`src/features/marketing/components/mobile-nav.tsx`) avoids this
by pointing the `Sheet`'s portal `container` at
`#daylight-marketing-root` (the id on the marketing layout's own wrapper)
instead of the default `document.body`. Any future marketing component that
portals (a tooltip, a dialog) needs the same `container` override — see
`src/components/ui/sheet.tsx`'s `container` prop.

### Light-only by design

Daylight does not have a dark-mode variant in this milestone. The design
export's own "dark mode overrides" table is written generically for a future
dark *dashboard*, not the landing page — no dark landing mockup exists. The
marketing wrapper sets `color-scheme: light` and never reads the visitor's
OS/browser dark-mode preference or the dashboard's own (separate, unaffected)
`next-themes` dark mode. This is a deliberate scope decision, not an
oversight — see "Small deviations" below.

## Palette

| Token | Hex | Use |
| --- | --- | --- |
| `--daylight-ink` | `#1B1F3B` | Primary text, headings |
| `--daylight-ink-soft` | `#4A5170` | Secondary text |
| `--daylight-muted` | `#8A90AE` | Tertiary text, placeholders |
| `--daylight-indigo` | `#4B57C9` | Brand / primary action |
| `--daylight-indigo-hover` | `#3E49AE` | Primary hover/active |
| `--daylight-indigo-tint` | `#EFF1FA` | Canvas background, selected fill |
| `--daylight-indigo-tint-2` | `#C9CEEC` | Secondary accents |
| `--daylight-border` | `#E8EBF7` | Hairlines, card borders |
| `--daylight-surface` | `#FFFFFF` | Cards, header |
| `--daylight-surface-muted` | `#F6F7FC` | Message bubbles, resting fills |
| `--daylight-canvas` | `#EFF1FA` | Page background |
| `--daylight-success` / `-tint` | `#0F7A55` / `#EAF7EF` | Lead captured, active |
| `--daylight-warning` / `-tint` | `#8A5800` / `#FDF2DC` | Needs review, gaps |
| `--daylight-danger` / `-tint` | `#C2410C` / `#FFF0EA` | Handed off, errors |
| `--daylight-focus` | `#AAB2E4` | Keyboard focus outline |

Decorative dark "billboard" panel colors (Trust & control section, final CTA,
footer, mobile nav overlay) — specific to those high-contrast section
moments, not general-purpose UI tokens: `--daylight-navy` (`#232A63`),
`--daylight-navy-panel` (`#2C3474`), `--daylight-navy-deep` (`#12152B`), plus
four `on-navy` text tones for body/muted/faint/eyebrow text on those
backgrounds. Two more, `--daylight-on-indigo-muted` (`#D3D8F6`) and
`--daylight-on-indigo-emphasis` (`#333D95`), cover text sitting directly on
a solid `--daylight-indigo` fill (the widget-preview header, the final CTA
band, the primary-on-navy button) — distinct from the `on-navy` set, which
is for the darker navy panels instead.

Every hex value lives only in `daylight.css` — components consume it
exclusively through the generated `daylight-*` utility classes, never a
scattered inline hex.

## Typography

- **Manrope** (400–800) — interface and display type: nav, buttons, labels,
  headings, body copy. The `.daylight-marketing` default (`font-daylight-sans`).
- **Libre Baskerville** — reserved for customer quotations, visitor-written
  text, and the landing page's few narrative "billboard" moments (hero
  subhead, Trust section subhead, final CTA subhead) — never UI chrome.
  Applied explicitly via `font-daylight-serif`.

Both load through `next/font/google` (`src/components/themes/font.config.ts`,
`fontManrope`/`fontLibreBaskerville`), added to the same `fontVariables`
string every other theme font uses — no external Google Fonts `<link>` tag.

Type scale (approved ranges, `Handoff.dc.html`'s own table):

| Role | Size | Weight |
| --- | --- | --- |
| H1 | 46–64px (responsive) | 800 |
| H2 (section) | 30–46px (responsive) | 800 |
| Card title | 17–20px | 800 |
| Body | 14–15px | 400 |

## Spacing, radii, shadow

Spacing scale (px): `4 · 8 · 12 · 14 · 16 · 20 · 24 · 28 · 32 · 48 · 56`.
Card padding 22–26px, section gaps 16px, page padding 20–48px depending on
breakpoint.

| Token | Value | Use |
| --- | --- | --- |
| `--radius-daylight-icon` | 8px | Icon tiles |
| `--radius-daylight-control` | 12px | Inputs, nav items |
| `--radius-daylight-card-sm` | 16px | Small cards |
| `--radius-daylight-card` | 22px | Cards, panels |
| `--radius-daylight-button` | 14px | Buttons |
| (pill) | `rounded-full` | Status pills, tags — plain Tailwind, no custom token needed |

| Token | Value | Use |
| --- | --- | --- |
| `--shadow-daylight-sm` | `0 2px 8px rgba(27,31,59,.05)` | Resting cards |
| `--shadow-daylight-md` | `0 10px 30px rgba(27,31,59,.06)` | Hero cards, hover |
| `--shadow-daylight-lg` | `0 18px 50px rgba(27,31,59,.12)` | Modals, frames, popovers only |
| `--shadow-daylight-button` | `0 12px 30px rgba(75,87,201,.26)` | Primary button elevation |

## Responsive rules

| Breakpoint | Landing page behavior |
| --- | --- |
| ≥ 1024px (desktop) | Two-column hero with the six-step product preview pinned right. Capability/any-business grids 3-up. |
| 768–1023px (tablet) | Hero stacks to one column; product preview follows. Capability/any-business grids drop to 2-up; how-it-works stays 3-up. |
| ≤ 767px (mobile) | Single column, 20px gutters. Buttons full width. Nav becomes a full-screen dark overlay (see Motion). No phone-device bezel anywhere. |

Verified at 320px, 390px, 768px, 1024px and 1440px: no horizontal overflow,
no clipped headlines, no overlapping controls.

## Accessibility rules

- Semantic `<header>`, `<main>`, `<section>`, `<footer>` throughout; exactly
  one `<h1>` (the hero headline) with a correct `h2`/`h3` hierarchy below it.
- Every nav item and CTA is a real `<a>`/`<Link>`, never a `<div>` with a
  click handler; decorative icons/dots carry `aria-hidden="true"`.
- Keyboard: the mobile nav is a real dialog (Base UI `Dialog` under
  `Sheet`) — focus moves into it on open, Tab cycles inside it, Escape
  closes it, and focus returns to the trigger button.
- Focus-visible outline uses `--daylight-focus` (`#AAB2E4`) at 2px with a
  visible offset on every interactive element — nav links, buttons, the
  menu trigger/close button.
- Minimum 44×44px hit area on every tap target (menu button, close button,
  buttons at mobile widths).
- Color is never the only signal — every status pill (Lead captured, Handed
  off) carries its own text label, not just a color chip.
- No essential content depends on JavaScript: the landing page's copy,
  headings, and links render from the server; only the mobile nav's
  open/close *interaction* needs the client.

## Motion rules

CSS-only, restrained: color/opacity transitions on hover and focus, and the
mobile nav's own open/close slide (via the existing `Sheet` primitive's
built-in transition). No scroll-jacking, no parallax, no floating/looping
decoration, no long staged-entrance sequences. `prefers-reduced-motion:
reduce` collapses the mobile nav's transition duration to near-zero
(`daylight.css`), scoped to the marketing subtree.

## Approved product terminology

Use: **conversation** (not call) · **visitor**/**customer** (not caller) ·
**Inbox** / **business Inbox** (not "Shared Inbox") · **human handoff** ·
**test the widget** · **tone and response length** · **Knowledge Base** ·
**lead captured** · **business owner**.

Avoid **"Your team picks up"** — V1 is single-owner (no multi-user teams).
Use instead: *"the business owner can continue with the full history"* or
*"handed off to the business."*

"Set tone and handoff" (a phrase from the raw design export) was corrected
to **"Set the response style"**, describing only the three real Agent
settings fields — tone, response length, custom instructions. Human handoff
is described as existing behavior (a widget setting), never as a
configurable Agent setting, and the copy never claims an owner can configure
*when* a person steps in — that setting doesn't exist in the repository.

## Unsupported claims to avoid

No phone/voice/microphone support, no WhatsApp/Instagram/SMS, no calendar or
booking integration, no "every channel" claim, no invented customer/
conversation counts, no free-usage quantities, no "three-minute setup," no
unverified certifications, no autonomous reasoning or autonomous business
actions, no multi-user/team-access claims. The reply engine is described
accurately as keyword-based, matched against Knowledge Base entries — never
as reasoning or generating novel answers.

## Small deviations from the raw export

- **Hero H1 size**: the raw export's desktop value (74px) doesn't fit two
  lines in this hero's actual column width once rendered in a real browser
  with real Manrope metrics (the export is a static design-tool render, not
  a live reflow). Reduced to 64px at the `lg` breakpoint — still within the
  approved 56–72px H1 range documented in `Handoff.dc.html`'s own type
  table — so "Every customer gets an answer." wraps cleanly instead of
  spilling to three lines.
- **Mobile nav "Help" item**: the approved export's mobile-nav reference
  includes a fourth "Help" link. No public Help route exists in this
  repository, so it was intentionally omitted rather than shipped as a dead
  link — exactly as this milestone's own instructions require.
- **"Try the demo" → "See how it works"**: kept as the approved milestone-1
  label; both instances on the landing page (hero and final CTA) now link to
  the real `/demo` interactive route added in Milestone 2, rather than a
  same-page scroll or a fake destination.
- **Footer "PRODUCT" list items** (Chat widget / Inbox / Knowledge Base):
  rendered as plain text, not links — the approved export shows them with no
  `href`, and none maps to one specific on-page anchor.

## How future milestones should adopt this system

- **Milestone 2 (interactive demo)**: extend `src/app/(marketing)/`, reusing
  `MarketingHeader`/`MarketingFooter` and the same `.daylight-marketing`
  scope. `ProductPreview` (`src/features/marketing/components/product-preview.tsx`)
  is the intended replacement/extension point — it's already an isolated,
  static, no-network component.
- **Dashboard redesign** (not scheduled by this milestone): when the
  dashboard adopts Daylight, either (a) extend `daylight.css`'s token set to
  cover dashboard-specific needs (data tables, sidebar) and apply the scope
  class to the dashboard's own root, replacing `zen.css`'s import, or (b)
  keep both systems side-by-side longer if a phased rollout is preferred.
  Either way, the palette/type/spacing values above are already the
  reusable source of truth — no re-deriving them from the design export a
  second time.

## Milestone 2 — public interactive demo (`/demo`)

Built on `src/features/demo/`, reusing every Daylight token above (no new
palette). Two deliberate deviations from this doc's own "how future
milestones should adopt this system" note above, and why:

- **Not nested under `src/app/(marketing)/`.** `/demo` is its own top-level
  route (`src/app/demo/page.tsx`), applying `.daylight-marketing` directly
  rather than inheriting `MarketingHeader`. The landing page's header nav
  (`NAV_LINKS` — Product / How it works / Demo) is a set of same-page
  section anchors (`#capabilities`, etc.) that don't exist on `/demo`;
  reusing that header would have shipped dead anchor links. `DemoHeader`
  (`src/features/demo/components/demo-header.tsx`) is a small, dedicated
  header instead: a real "Back to Platform" link to `/`, plus the same
  `/login` and `/signup` destinations.
- **Not an extension of `ProductPreview`.** That component stays exactly as
  Milestone 1 left it — a static, six-step illustration on the landing page
  itself. `/demo` is a separate, fully interactive experience with its own
  typed state machine; `ProductPreview` was not proven to compose cleanly
  with real chat state, so it was left untouched rather than force-fit.

**Isolation boundary** (so a future milestone can swap in real AI without
touching UI code): all demo content and logic lives in
`src/features/demo/` and imports nothing from `src/features/widget`,
`src/features/inbox`, `src/features/leads`, or any Supabase client.

- `scenarios.ts` — fixed, fictional business/Knowledge Base data.
- `match-answer.ts` — a small local keyword matcher, the demo's stand-in for
  the (also keyword-based) production reply engine. Replacing this one file
  with a real AI call is the intended integration point; it takes a
  business and a string and returns a typed result, nothing more.
- `use-demo-chat.ts` — a typed reducer plus one effect that simulates a
  short "typing" delay before resolving through `match-answer.ts`. No
  network calls, no `localStorage`, no Supabase.
- `components/` — presentational only; every side effect goes through the
  reducer's action creators.

No component in this route calls `fetch`, a Supabase client, or any
`src/features/widget`/`inbox`/`leads` service function — verified by the
import boundary above and exercised by `e2e/demo.spec.ts`.
