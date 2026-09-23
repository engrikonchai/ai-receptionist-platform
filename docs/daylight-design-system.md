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

Every Daylight token above is a fixed hex value (`.daylight-marketing`'s CSS
custom properties never branch on `.dark`), so this holds even on the auth
pages, which do render `<ThemeModeToggle/>` (see "Milestone 3" below) —
toggling `next-themes`'s `dark` class on `<html>` is a real, working
app-wide preference change, but it is a visual no-op anywhere inside
`.daylight-marketing`, because nothing in `daylight.css` reads `.dark`.

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

## Milestone 3 — Daylight authentication experience

A **visual and usability refresh only** of the existing login, signup,
forgot-password, reset-password, and onboarding surfaces
(`src/app/login`, `/signup`, `/forgot-password`, `/reset-password`,
`/onboarding`). No authentication behavior, redirect logic, cookie/session
handling, Supabase client architecture, route protection, or onboarding
database behavior changed — see "Authentication behavior preserved" below.

### Authentication layout

`DaylightAuthShell` (`src/features/auth/components/daylight/daylight-auth-shell.tsx`)
is a new, self-contained shell — never the shared `AuthShell`
(`src/features/auth/components/auth-shell.tsx`), which is left completely
untouched because `AccountRecovery` still renders it directly inside
`dashboard/layout.tsx` as a Zen-themed fallback; restyling `AuthShell` would
have restyled that dashboard surface too.

- **Header**: a real "Back to Platform" link to `/`, plus `ThemeModeToggle`
  (parity with the original `AuthShell` — see "Deliberate deviations"
  below), on a white `bg-white` bar with a `--daylight-border` bottom hairline.
- **Desktop (`lg:` and up)**: two-column split — a centered, readable
  `max-w-md` form column on the left, `DaylightAuthVisual`
  (`daylight-auth-visual.tsx`) on the right: a navy supporting panel with the
  real hero headline/bullets ("Website chat widget", "Your business Inbox",
  "Human handoff") and one illustrative chat-bubble snippet — never a fake
  screenshot, logo, or invented statistic.
- **Mobile/tablet (below `lg:`)**: single column, `DaylightAuthVisual` is
  `hidden` entirely so the form is the first thing shown, no scroll needed.
  The form column uses `items-start` (not `items-center`) below `lg:` so
  short content (e.g. the forgot-password form) never leaves an oversized
  empty gap above it on a phone — only `lg:items-center` re-centers it once
  the two-column layout has room.

### Form-state components

All new, Daylight-styled, and never shared with dashboard-facing
components — the same `.daylight-marketing`-scoping reason as everywhere
else in this doc: a shared component styled with `bg-background`/
`text-foreground`/`Card`/`FieldError` would render in the wrong (Zen)
palette if a Daylight page reused it, and a `daylight-*` class on a
shared/dashboard component would render blank outside `.daylight-marketing`.

- `daylight-text-field.tsx` / `daylight-password-field.tsx` — Daylight
  inputs built directly on `useFieldContext()`/`useFieldInvalid()`, styled
  with the new `--daylight-input-border` token (see "Deliberate deviations").
  The password field adds a keyboard-accessible show/hide toggle
  (`aria-label`/`aria-pressed`, Enter/Space-operable).
- `daylight-field-error.tsx` — `role="alert"`, same de-duplication logic as
  the shared `FieldError`, Daylight-colored.
- `daylight-submit-button.tsx` — disables and shows a spinner
  (`aria-busy`) while `form.state.isSubmitting`, preventing duplicate
  submission. **Must be rendered inside `<form.AppForm>…</form.AppForm>`**
  — `useFormContext()` is a separate context from the per-field context
  `form.AppField` provides.
- `daylight-form-message.tsx` — one banner component for every non-field
  message: `variant='error'` → `role="alert"`; `variant='success'` /
  `'info'` → `role="status"` (never `alert`, so a success/info message
  doesn't interrupt a screen reader the way an error should). Accepts a
  `ref` so the caller can move focus to it after a server error.
- `daylight-config-notice.tsx` / `daylight-invalid-link.tsx` — thin,
  purpose-specific wrappers around `DaylightFormMessage` for the
  missing-Supabase-config and expired-reset-link states.

### Responsive behavior

Verified at 390px, 768px, and 1440px (plus the 1440px first fold) for
`/login`, `/signup`, and `/forgot-password`: no horizontal overflow (see
`e2e/auth-daylight.spec.ts`), no clipped form, no wrapped primary-button
label, no oversized empty mobile area (the `items-start`/`lg:items-center`
fix above), and a clear login↔signup path at every width.

### Accessibility

- Labels are always real, explicit `<label>` elements (never
  placeholder-only), with correct `autoComplete` values preserved from the
  pre-refresh forms.
- Focus moves to the server/form error banner after a failed submission
  (`errorRef` + `useEffect` in each form), via a `tabIndex={-1}` +
  `.focus()` pattern that never fires on first page load.
- The password show/hide toggle is a real `<button type="button">` with
  `aria-label`/`aria-pressed`, reachable and operable by keyboard alone.
- The submit button's `aria-busy` state is exposed to assistive tech, not
  just visually implied by a spinner.
- Focus-visible outlines use `--daylight-focus`, same token and 2px/offset
  treatment as the rest of Daylight.

### Scope / isolation boundary

`DaylightAuthShell` applies `.daylight-marketing` on the auth pages
themselves — the same scoping mechanism as the landing page and `/demo`,
never a change to `zen.css`, `[data-theme='zen']`, `:root`, or any shared
dashboard component. `e2e/daylight-landing.spec.ts`'s
"`/login` and `/signup` still render their real, functioning forms" test
was updated in this milestone: before Milestone 3, `/login`/`/signup` had
*zero* `.daylight-marketing` elements (they used the Zen-themed `AuthShell`)
and the test asserted exactly that; now that they are deliberately
Daylight-scoped, that specific assertion is gone, but the test still guards
what it always actually existed to protect — that the real forms render and
work — and the dashboard itself (verified via its still-enforced signed-out
redirect, unchanged) is never touched by any Daylight class.

### Auth dark theme

A follow-up to the initial (light-only) Milestone 3 work: `DaylightAuthShell`
renders a real `<ThemeModeToggle/>` (parity with the original `AuthShell`),
but every Daylight token is a fixed hex value, so toggling it used to be a
visual no-op — functionally real, but not what "a real, working toggle"
should feel like. This adds a restrained, auth-only dark variant instead of
hiding the toggle.

- **Scope.** A second marker class, `daylight-auth-scope`, sits alongside
  `daylight-marketing` on `DaylightAuthShell` and `OnboardingShell` only.
  `src/styles/daylight.css`'s dark overrides are keyed off
  `.dark .daylight-marketing.daylight-auth-scope` — two classes, both
  required — so the landing page and `/demo` (which carry only
  `daylight-marketing`) are structurally unable to pick up this block, even
  when the visitor's global theme preference is already dark (verified by
  `e2e/auth-dark-theme.spec.ts`'s "public landing page never picks up the
  auth-only dark styling" test). `zen.css`, `[data-theme='zen']`, and
  `:root` are untouched, same as every other rule in this file.
- **Palette.** Reuses the already-approved dark "billboard" navy family
  (`--daylight-navy`/`-panel`/`-deep`) — already used by the landing page's
  Trust/footer/final-CTA sections and by `DaylightAuthVisual`'s always-dark
  supporting panel — as the dark canvas/surface, so the whole page reads as
  a natural extension of that panel rather than a new, disconnected dark
  design. Semantic ink/border/status tokens get restrained, contrast-checked
  dark-calibrated values (e.g. `--daylight-danger: #FF8A65`, a warm coral —
  not the light-mode burnt-orange value, which reads muddy on a dark
  background). `--daylight-indigo`/`-indigo-hover` are deliberately **not**
  overridden: white-on-indigo already contrasts at roughly 6:1 and reads
  even richer against a dark navy canvas, so the primary button/link color
  is identical in both modes. The canvas is a dark navy
  (`--daylight-navy-deep`, `#12152B`), never pure black — calm, not the old
  dense auth design.
- **`bg-white` → `bg-daylight-surface`.** The auth/onboarding header bars,
  the onboarding card, and the text/password input backgrounds previously
  used a hardcoded `bg-white` (invisible to any token override). Swapped for
  the `--daylight-surface` token (`#FFFFFF` in light, `#1A2050` in dark) so
  they participate in the theme instead of staying a fixed white patch on a
  dark page.
- **One deliberate non-change:** `DaylightAuthVisual`'s small chat-bubble
  mockup card keeps literal light colors (`bg-[#F6F7FC]`/`text-[#1B1F3B]`),
  not the `daylight-surface-muted`/`daylight-ink` tokens. It's a fixed
  screenshot of the real, always-light customer-facing widget UI, not part
  of the auth page's own theme — it must look identical regardless of
  whether the business owner is viewing the page in light or dark mode.
- **Persistence/behavior.** No changes to `next-themes`, the `ThemeProvider`
  config in `src/app/layout.tsx`, or the `active_theme`/theme cookie —
  the auth pages read and write the exact same global theme preference as
  the rest of the app.

### Onboarding

`OnboardingShell` (`src/features/onboarding/components/onboarding-shell.tsx`)
gets the calmer, internal-facing treatment implied by this milestone's own
"Dashboard.dc.html for calm internal visual language" reference: a Daylight
canvas + header + a single white `rounded-daylight-card` around the
content, not the expressive two-column auth layout. **Only the outer shell
was touched.** `OnboardingFlow` (`src/features/onboarding/components/onboarding-flow.tsx`,
613 lines — steps, validation, business-creation logic, redirects) is
rendered unmodified as `{children}` inside the new card — the milestone's
"preserve existing onboarding steps/required fields/business-creation
behavior" constraint made touching that file out of scope by default, and
no visual defect was found that required entering it.

### Authentication behavior preserved

Confirmed unchanged in every rewritten form (`login-form.tsx`,
`signup-form.tsx`, `forgot-password-form.tsx`, `reset-password-form.tsx`):
the Zod schemas (`src/features/auth/schemas/auth.ts`), the Supabase calls
(`signInWithPassword`/`signUp`/`resetPasswordForEmail`/`updateUser`) and
their argument shapes, `classifyUpdateError`'s error classification, the
non-revealing forgot-password confirmation copy, the check-your-email
branch, the `/onboarding` and `/auth/callback?next=` redirect targets, and
every `router.push`/`router.refresh` call. Only presentation (markup,
classNames, which components render the same state) changed. `proxy.ts`,
`loadOwnerContext()`, `isSafeInternalPath`/`resolveSafeNextPath`
(`src/lib/safe-redirect.ts`), and `src/app/auth/callback/route.ts` were not
touched at all.

### Deliberate deviations

- **Password-visibility toggle added to login and signup.** Neither form
  had one before this milestone (`reset-password-form.tsx` and
  `forgot-password-form.tsx`'s password fields already did, via the shared
  `PasswordField`). Added for consistency across every Daylight auth form
  and because the milestone's own form-experience requirements list
  "password-visibility controls (if already present)" alongside the general
  instruction to improve presentation — this is presentation, not a change
  to what is submitted.
- **`ThemeModeToggle` restored to `DaylightAuthShell`.** An earlier pass in
  this milestone omitted it, reasoning Daylight should be light-only like
  the landing page; that broke the pre-existing
  `e2e/auth-pages.spec.ts` "theme toggle switches the page ... without an
  app change" test. Since Daylight's own tokens are fixed/light-only
  regardless of the `dark` class (see "Light-only by design" above),
  restoring the toggle is functionally real (it's still the same
  app-wide `next-themes` preference) but visually inert inside
  `.daylight-marketing` — so restoring it preserves the existing test and
  existing functionality without reintroducing a dark Daylight variant.
- **New token**: `--daylight-input-border` (`#D8DCF1`, from
  `Design System.dc.html` §06 "Inputs and controls") — deliberately its own
  token rather than reusing `--daylight-border` (hairlines/card borders,
  from `Handoff.dc.html`), since inputs use a slightly cooler value in the
  export. Danger/success states reuse the existing `--daylight-danger`/
  `--daylight-success` tokens rather than adding new near-duplicate
  colors.
- **`OnboardingFlow`'s internals were not restyled**, only its shell — see
  "Onboarding" above.

### Missing auth functionality found but intentionally not added

None. Password recovery (forgot/reset password) was already implemented
end-to-end before this milestone; no other auth route or flow (social
login, magic-link, passkeys, phone auth, team invitations) exists in the
repository, and this milestone's own instructions explicitly forbid adding
any of them.

## Milestone 4 — Dashboard shell

A visual refresh of the authenticated `/dashboard/*` shell only — the
sidebar, header, and account/theme chrome shared by every dashboard page.
**No individual page's content, data, queries, or mutations changed.**

### Scope / isolation architecture

A third, independent scope alongside the two Daylight already has:

| Scope | File | Applied on | Token style |
| --- | --- | --- | --- |
| `.daylight-marketing` | `daylight.css` | Public landing, `/demo`, and (since Milestone 3) the auth pages | Invented `daylight-*`-prefixed tokens/utilities |
| `.daylight-dashboard` | `daylight-dashboard.css` | The authenticated dashboard shell only | **Overrides the standard shadcn variable names** |

The dashboard is the one surface that was already built entirely on
shared shadcn components (`Card`, `Button`, `Sidebar`, `PageContainer`,
…) consuming the standard variable names (`--background`, `--card`,
`--primary`, `--sidebar`, `--border`, …). So `daylight-dashboard.css`
overrides those *same* names, scoped to a `.daylight-dashboard` class —
never `:root` or `[data-theme='zen']` themselves, which stay exactly as
`zen.css` already defines them. Because it's the same variable names,
every existing dashboard page and every shared component repaints
automatically through the CSS cascade, with **zero markup changes to any
individual page** — the mechanism that makes "restyle the shell without
touching page content" possible at all. See `daylight-dashboard.css`'s
own header comment for the full reasoning.

The scope is applied in exactly one place: `className='daylight-dashboard'`
on the `SidebarProvider` in `src/app/dashboard/layout.tsx`. `AccountRecovery`
(the `AuthShell`-based fallback for an incomplete profile or a
multiple-businesses account) is rendered as an early `return` *before*
that `SidebarProvider`, so it is structurally outside the scope and stays
on plain Zen tokens, unaffected — the same "never touch `AuthShell`"
boundary Milestone 3 established, now automatic rather than manual since
the scope simply never wraps it.

### Dashboard shell tokens

Light values are sourced from `Handoff.dc.html`'s "COLOR TOKENS" table
and `Dashboard.dc.html`'s "SHELL ANATOMY" panel; dark values from
`Design System.dc.html` §09 "Dark mode mapping" (light→dark, explicit),
reconciled with `Handoff.dc.html`'s own terser dark-mode note where the
two overlap.

| Token | Light | Dark |
| --- | --- | --- |
| `--background` (canvas) | `#EFF1FA` | `#12152B` |
| `--card`/`--sidebar` (surface) | `#FFFFFF` | `#1C2040` |
| `--foreground` (ink) | `#1B1F3B` | `#EEF0FB` |
| `--muted-foreground` | `#6B7192` | `#9AA0C6` |
| `--primary`/`--sidebar-primary` (indigo) | `#4B57C9` | `#7C88E8` |
| `--border`/`--input`/`--sidebar-border` | `#E8EBF7` / `#D8DCF1` | `#2A3060` |
| `--destructive` | `#A82926` | `#F0724B` |
| `--sidebar-accent` (active-nav fill) | `#EFF1FA` | `#242C57` |
| `--sidebar-accent-foreground` (active-nav text) | `#4B57C9` | `#B9C0E8` |

`--primary`/`--sidebar-primary` are **not** simply lifted for a filled
button: `--primary-foreground` is set to the dark canvas color
(`#12152B`) rather than white, because white text on the lighter dark-mode
indigo (`#7C88E8`) lands under 4.5:1 contrast — dark text on that same
light indigo clears ~6:1. `--font-sans` is overridden to Manrope (reusing
the same font already loaded for the marketing scope — no second font
load), so the dashboard now shares its typeface with the rest of the
product. `--radius` is raised to `0.75rem` (buttons/`rounded-lg` → 12px,
cards/`rounded-xl` → 16px) — a deliberately more conservative lift than
the mockup's literal 22px card radius; see "Design deviations" below.

### Sidebar rules

- **Brand mark.** A new row above the business-identity pill:
  `Icons.logo` in a solid `--sidebar-primary` tile + the "Platform"
  wordmark, linking to `/dashboard/overview`. The sidebar previously had
  no product branding at all, only the business name.
- **Business identity.** `BusinessSwitcher` is unchanged in behavior — a
  disabled, non-interactive display (V1 is one-owner-one-business; see
  its own doc comment) — only visually refreshed: initials avatar
  (derived from the real business name, never invented) in a bordered
  `--muted` pill instead of a plain icon tile, and `disabled:opacity-100`
  added so the disabled state no longer fades the business name to 50%
  opacity — a real "low-contrast text" bug in the pre-Daylight sidebar,
  fixed while already touching this component.
- **Active state.** `data-active` already drove a bold weight + tint fill
  + indigo text via `sidebarMenuButtonVariants`; this milestone adds the
  Component Rules table's "3px inset left bar"
  (`shadow-[inset_3px_0_0_var(--sidebar-accent-foreground)]`) and a real
  `aria-current="page"` on the active link — so the active item is never
  signaled by color alone (weight + fill + bar + `aria-current` together).
- **Active-route matching** (`isNavItemActive` in `app-sidebar.tsx`) was
  upgraded from exact `pathname === url` to `pathname === url ||
  pathname.startsWith(url + '/')`, so a parent item stays correctly
  highlighted for any path nested beneath it. No route in this app is
  actually nested today (verified — every dashboard route is a flat
  top-level page), so this is a forward-looking correctness fix, not a
  behavior change to anything currently reachable.
- **Badges** (`Inbox`/`Leads` pending counts) are unchanged — they were
  already real, business-scoped Supabase counts (`use-nav-badge-counts.ts`),
  never fake.
- **Icon-collapsed rail and mobile drawer** are the existing shadcn
  `Sidebar` primitive's own behavior, unchanged — only re-themed via the
  token cascade.

### Header rules

Unchanged structurally — `SidebarTrigger`, `Breadcrumbs`, the `SearchInput`
(opens the existing, real Cmd+K `KBar` palette — not decorative, not
added by this milestone), and `ThemeModeToggle` all already used
`bg-background`/`border`/etc. and repaint automatically. No markup
changes were needed here.

### Content-container rules

`PageContainer` (the shared page heading + content wrapper every
dashboard page already uses) was **not modified** — its spacing/max-width
was already reasonable and restyling it wasn't required to prevent shell
breakage, so it was left alone per this milestone's "small spacing
corrections... must be documented" instruction (there are none to
document here). Its `Heading`/`Card`/`Badge`/`Button` children repaint
automatically through the same token cascade.

### Mobile navigation behavior

The existing shadcn `Sidebar` mobile pattern (a `Sheet`/Base UI `Dialog`
drawer — real focus trap, Escape-to-close, scroll lock, closes itself on
navigation via `closeMobileSidebar()`) is reused entirely; **no new
bottom-navigation system was built** — see "Design deviations" below for
why. One real bug was found and fixed: the mobile Sheet portals to
`document.body` by default, which sits *outside* `.daylight-dashboard`
and would have silently rendered the drawer in plain Zen colors (visually
confirmed during verification — a warm-beige drawer over an indigo-toned
page). Fixed the same way Milestone 1 fixed the identical issue for the
marketing mobile nav: a new `container` prop on `Sidebar` (`ui/sidebar.tsx`)
and `AppSidebar` now points the Sheet's portal at
`#daylight-dashboard-root` (the id on `SidebarProvider`'s own wrapper).

### Light/dark theme behavior

`next-themes`, its `ThemeProvider` config, `attribute='class'`,
persistence, and system-preference behavior are all completely
untouched — the dashboard reads and writes the exact same global theme
preference as the rest of the app (including the Milestone 3 auth dark
theme). Toggling it now produces a real, calm dark dashboard (deep navy
canvas/surfaces, never pure black — verified by
`daylight-dashboard.test.ts`) instead of the old Zen dark theme's
near-black `oklch(0.1913 0 0)` background.

### Design deviations

- **No new bottom-navigation bar.** `Handoff.dc.html`'s responsive table
  and `Dashboard.dc.html`'s "SHELL ANATOMY" panel both describe a bottom
  tab bar ("Overview / Inbox / Leads / More") below ~900px. This
  milestone's own body text explicitly lists "navigation opens in a
  drawer/sheet **or** the existing mobile pattern" as a sufficient
  mobile solution, and separately warns against inventing new
  bottom-navigation systems. Building one would mean deciding, unreviewed,
  which 3 of the 10 real nav items are demoted into a new "More" overflow
  menu — a real information-architecture decision the design reference
  doesn't actually specify beyond a one-line table cell. The existing,
  already-accessible Sheet drawer satisfies "genuinely usable mobile
  navigation" without that risk. Flagged here explicitly in case a bottom
  tab bar is wanted as a deliberate follow-up.
- **`--radius: 0.75rem`, not the mockup's literal 22px card radius.**
  Scaling the single `--radius` primitive lifts buttons to the spec's
  12–14px range exactly and cards to 16px — most of the way there without
  a full page-by-page pass to confirm every existing dense table/form
  still reads well at a full 22px corner radius.
- **`--secondary`/`--accent` dark fills** (`#1C2040`/`#242C57`) and the
  **dark button-fill foreground** (`#12152B` instead of white — see
  "Dashboard shell tokens" above) aren't given explicit values by either
  design reference; both are reasoned, documented interpolations within
  the same approved dark navy family, not new invented hues.
- **Business-identity avatar now shows real initials** instead of a
  generic icon (matching `Dashboard.dc.html`'s own "NS" initials-avatar
  pattern) — derived from the real business name at render time, never a
  hardcoded example.
- **`disabled:opacity-100` on `BusinessSwitcher`** — a pre-existing
  low-contrast bug (the disabled business-identity pill faded to 50%
  opacity), fixed while this milestone was already touching the
  component's styling.

### Shell / page-content isolation — confirmed

Every dashboard page's own content — Overview's metric cards, Inbox's
conversation UI, Leads' table/filters, Knowledge's forms, Agent's
settings controls, Channels/Team's planned-state content, Widget's
config/install content, Settings' forms, Billing's content — was **not
opened or edited** by this milestone. Verified: `git diff` touches only
`src/app/dashboard/layout.tsx` (the scope class), `src/components/layout/
app-sidebar.tsx`, `business-switcher.tsx`, `src/components/ui/sidebar.tsx`
(the new `container` prop), `src/styles/daylight-dashboard.css` (new),
and `src/styles/globals.css` (one import line) — no file under
`src/app/dashboard/*/page.tsx` or any page-specific feature component was
changed.

### Future page-refresh guidance

Individual dashboard pages already automatically inherit the new palette
(same token names, same components) — a future page-level Daylight pass
should focus on *layout/density* refinements (spacing, card composition,
whether 22px card radius is right for that specific page's content),
never re-deriving colors, which are already correct. `PlaceholderPage`
(Team, Channels) and `PageContainer` are the two shared building blocks
most future page work will touch first.
