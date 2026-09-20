<h1 align="center">Admin Dashboard Template with Next.js &amp; Shadcn UI</h1>

<div align="center">Free, open source admin dashboard starter built with Next.js 16, shadcn/ui, Tailwind CSS, and TypeScript</div>

<div align="center">
  <a href="https://dub.sh/shadcn-dashboard"><strong>View Demo</strong></a>
</div>

<br />

<div align="center">
  <img src="/public/shadcn-dashboard.png" alt="Shadcn Dashboard Cover" style="max-width: 100%; border-radius: 8px;" />
</div>

<br />

<p align="center">
  <a href="https://github.com/Kiranism/next-shadcn-dashboard-starter/stargazers"><img src="https://img.shields.io/github/stars/Kiranism/next-shadcn-dashboard-starter?style=social" alt="GitHub stars" /></a>
  <a href="https://github.com/Kiranism/next-shadcn-dashboard-starter/network/members"><img src="https://img.shields.io/github/forks/Kiranism/next-shadcn-dashboard-starter?style=social" alt="Forks" /></a>
  <a href="https://github.com/Kiranism/next-shadcn-dashboard-starter/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Kiranism/next-shadcn-dashboard-starter" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/Next.js-16-black" alt="Next.js" />
</p>

## Overview

A free, open source (MIT) admin dashboard starter built with Next.js 16, shadcn/ui on Base UI primitives, TypeScript, and Tailwind CSS v4.

Every feature is a working, production-ready implementation, not static demo UI. Tables search, filter, sort, and paginate for real. Forms validate and mutate with cache invalidation.

Clone it, strip what you don't need with the built-in cleanup script, and start building on patterns you'd write yourself. It works well as a base for SaaS apps, internal tools, and admin panels.

### Why This Template

Most dashboard templates are static demo boilerplates: screens that look finished but need rebuilding the moment you wire in real data. This starter takes the opposite approach:

- **Everything actually works.** Data tables run end-to-end: server prefetch, client-side React Query cache, and URL-synced search, filtering, sorting, and pagination via nuqs. Forms are built from reusable, composable fields with Zod validation, including advanced patterns like multi-step and dialog/sheet forms, with real create/update mutations and cache invalidation on success.
- **Industry-standard implementations.** The data layer follows the official TanStack Query SSR pattern (server prefetch + `HydrationBoundary` + `useSuspenseQuery`), typed end to end, organized in a feature-based structure with a clean API layer per feature. These are patterns you copy into production code as-is, not mockups you rebuild from scratch.
- **Minimal by design.** Deliberately lean, with no bloated boilerplate, so you spend your time tweaking it to your use case, not deleting someone else's code. The built-in [cleanup script](#cleanup-script-start-minimal-in-60-seconds) strips any feature you don't need in under a minute.

### Tech Stack

- Framework - [Next.js 16](https://nextjs.org/16)
- Language - [TypeScript](https://www.typescriptlang.org)
- Styling - [Tailwind CSS v4](https://tailwindcss.com)
- Components - [shadcn/ui](https://ui.shadcn.com) on [Base UI](https://base-ui.com) primitives
- Charts - [Recharts](https://recharts.org) • [Evil Charts](https://evilcharts.com/)
- Schema validation - [Zod](https://zod.dev)
- Data fetching - [TanStack React Query](https://tanstack.com/query)
- State management - [Zustand](https://zustand-demo.pmnd.rs)
- Search param state - [Nuqs](https://nuqs.47ng.com/)
- Tables - [TanStack Data Tables](https://ui.shadcn.com/docs/components/data-table) • [Dice Table](https://www.diceui.com/docs/components/data-table)
- Forms - [TanStack Form](https://tanstack.com/form) + [Zod](https://zod.dev)
- Command+K interface - [kbar](https://kbar.vercel.app/)
- Linter / Formatter - [OxLint](https://oxc.rs/docs/guide/usage/linter) • [Oxfmt](https://oxc.rs/docs/guide/usage/formatter)
- Pre-commit hooks - [Husky](https://typicode.github.io/husky/)
- Themes - [tweakcn](https://tweakcn.com/)

_Looking for a TanStack Start version? Here's the [repo](https://git.new/tanstack-start-dashboard)._

## Features

- Pre-built dashboard layout with sidebar, header, and content area
- Analytics overview page with cards and charts
- Data tables with React Query prefetch, client-side cache, search, filter, and pagination
- Infobar component for tips, status messages, or contextual notes on any page
- shadcn/ui components on Base UI primitives, styled with Tailwind CSS
- Six-plus themes with a theme switcher
- Feature-based folder structure
- A starting point for SaaS dashboards, internal tools, and client admin panels

## Use Cases

A few things you can build with it:

- SaaS admin dashboards
- Internal tools and operations panels
- Analytics dashboards
- Client project admin panels
- A boilerplate for new Next.js shadcn projects

## Pages

| Page                                                                                                                                                                  | Notes                                                                                                                                                                                |
| :------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Dashboard Overview](https://shadcn-dashboard.kiranism.dev/dashboard)                                                                                                 | Cards and Recharts graphs. Parallel routes give each section its own loading and error state.                                                                                       |
| [Product List (Table)](https://shadcn-dashboard.kiranism.dev/dashboard/product)                                                                                       | TanStack Table plus React Query (server prefetch, client cache) with nuqs URL state for search, filter, and pagination. `shallow: true` keeps interactions on the client.           |
| [Create Product Form](https://shadcn-dashboard.kiranism.dev/dashboard/product/new)                                                                                    | TanStack Form and Zod with `useMutation` for create and update. Cache is invalidated on success.                                                                                    |
| [Users (Table)](https://shadcn-dashboard.kiranism.dev/dashboard/users)                                                                                                | Same setup as Products: React Query with nuqs, server prefetch, and client-side pagination and filtering.                                                                           |
| [Chat](https://shadcn-dashboard.kiranism.dev/dashboard/chat)                                                                                                          | Messaging UI with a conversation list, message bubbles, quick replies, attachments, and an auto-reply demo. Multi-panel layout that works on mobile. |
| [AI Chat](https://shadcn-dashboard.kiranism.dev/dashboard/ai-chat)                                                                                                    | Scripted AI chat that streams a predefined conversation through the real `useChat` lifecycle — no model, API route, or key. Built with the shadcn chat components (MessageScroller, Bubble, Marker). |
| [Not Found](https://shadcn-dashboard.kiranism.dev/dashboard/notfound)                                                                                                 | A root-level not-found page.                                                                                                                                                        |

## Folder Structure

```plaintext
src/
├── app/                           # Next.js App Router directory
│   ├── dashboard/                 # Dashboard route group
│   │   ├── overview/              # Analytics with parallel routes
│   │   ├── product/               # Product CRUD pages (React Query)
│   │   ├── users/                 # Users table (React Query + nuqs)
│   │   ├── chat/                  # Messaging page
│   │   ├── ai-chat/               # AI chat streaming demo
│   └── api/                       # API routes
│
├── components/                    # Shared components
│   ├── ui/                        # UI primitives (buttons, inputs, dialogs, etc.)
│   ├── layout/                    # Layout components (header, sidebar, etc.)
│   ├── themes/                    # Theme system (selector, mode toggle, config)
│   └── kbar/                      # Command+K interface
│
├── features/                      # Feature-based modules
│   ├── overview/                  # Dashboard analytics (charts, cards)
│   ├── products/                  # Product listing, form, tables (React Query)
│   ├── users/                     # User management table (React Query)
│   ├── chat/                      # Messaging (conversations, bubbles, composer)
│   ├── ai-chat/                   # Scripted useChat streaming demo (shadcn chat UI)
│
├── lib/                           # Core utilities (query-client, searchparams, etc.)
├── hooks/                         # Custom hooks
├── config/                        # Navigation, infobar, data table config
├── constants/                     # Mock data
├── styles/                        # Global CSS & theme files
│   └── themes/                    # Individual theme CSS files
└── types/                         # TypeScript types
```

## Getting Started

> [!NOTE]
> This starter uses Next.js 16 (App Router) with React 19 and shadcn/ui. To run it locally:

Clone the repo:

```
git clone https://github.com/Kiranism/next-shadcn-dashboard-starter.git
```

- `bun install`
- Copy the example env file: `cp env.example.txt .env.local`
- Fill in the required variables in `.env.local`
- `bun run dev`

##### Environment variables

See `env.example.txt` for the variables you need. They cover authentication and error tracking.

The app should now be running at http://localhost:3000.

> [!WARNING]
> After cloning or forking, be careful when pulling the latest changes. Updates can cause merge conflicts.

---

## Testing

Unit/integration tests run on [Vitest](https://vitest.dev/):

```bash
bun run test          # run once
bun run test:watch    # watch mode
```

### End-to-end tests (Playwright)

Install Chromium once (only Chromium is used, so this is the only browser you need):

```bash
bunx playwright install chromium
```

Then run the suite:

```bash
bun run test:e2e       # headless, CLI output
bun run test:e2e:ui    # Playwright's interactive UI mode
```

This builds the app and runs it on a fixed local port (see `playwright.config.ts`) — it never targets a deployed/production URL.

The committed E2E suite (`e2e/`) is **intentionally secret-free**: it only covers flows that work without a real Supabase or Paddle project — the auth pages (`/login`, `/signup`, `/forgot-password`) loading and passing basic accessibility/responsive checks, `/dashboard/overview` redirecting safely to `/login` when signed out, and the static `/widget-loader.js` script serving correctly. It never signs in, signs up, or calls a real external API. Testing authenticated flows against a live Supabase/Paddle project is a separate, future E2E environment, not part of this suite.

### Database verification (Supabase)

Proves that a completely **blank** Supabase project — no ChatbotDemo repository, no manual setup — can apply this repository's entire migration chain (`supabase/migrations/`), provision a new owner on signup, and enforce Row Level Security. This runs against an **ephemeral local Supabase stack**, never the real production project, and needs **no production credentials at all**.

**Requires Docker** (with Compose) running locally. The Supabase CLI itself is already a pinned dev dependency (`bunx supabase ...`, no global install).

```bash
bun run db:start    # start the local Supabase stack (Postgres + Auth + API only — see supabase/config.toml)
bun run db:reset     # apply every migration to that local database, from zero
bun run test:db      # run the pgTAP database tests (supabase/tests/*_test.sql)
bun run test:db:provisioning   # signup/provisioning integration harness (supabase/tests-integration/provisioning.ts)
bun run db:stop      # stop the local stack
```

`bun run verify:db` runs the full sequence CI uses (start → reset → pgTAP tests → provisioning harness → reset again → smoke tests → stop, stopping the stack even if a step fails) — see `scripts/verify-db.sh`.

**⚠️ Never run `bun run db:reset` (or any `supabase db reset`/`db push`) against the production Supabase project.** Every command above is hard-scoped to the local stack (`--local`, or a CLI call that only ever targets `127.0.0.1`) and none of it accepts `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` — the local stack's own throwaway local-only keys and URL are read directly from `supabase status` instead.

`supabase/migrations/20260910090000_self_contained_database_baseline.sql` — the migration that makes a blank database possible at all — is already represented in production (its shape matches what production already had before this repository owned its own baseline). It exists to bootstrap a **fresh** environment; production doesn't need it re-applied, and a future Supabase CLI reconciliation against production may need that specific migration version marked as already applied rather than executed (see that file's own header comment).

---

## Cleanup Script: Start Minimal in 60 Seconds

Most starters make you hand-delete demo pages and rip out dependencies. This one ships with a cleanup script that removes the optional features you don't need (folders, files, dependencies, docs, and env entries), leaving a minimal base to build on. Run `--list` to see what's removable:

```bash
bun run cleanup --interactive    # interactive mode
bun run cleanup --list           # see available features
bun run cleanup --dry-run chat   # preview before removing
bun run cleanup kanban chat      # remove specific features
```

Run `bun run cleanup --help` for all options (with npm, pass flags after `--`: `npm run cleanup -- --list`). The replacement files it writes live in `scripts/cleanup-templates/` as real, typechecked code. When you're done, delete `scripts/cleanup.js`, `scripts/cleanup-templates/`, and the `cleanup` entry in `package.json`.

## FAQ

**Is it production ready?**
Yes. Every feature is a complete, working implementation: authentication, CRUD flows, table search/filter/sort/pagination, and form validation with mutations all function end-to-end. It's a starting point for real applications, not a visual mockup.

**How is this different from other dashboard templates?**
Most dashboard templates are static demo boilerplates: screens that look finished but need rebuilding once you wire in real data. Here the tables, forms, auth, organizations, and billing all work end-to-end, the implementations follow official TanStack and Next.js patterns, and a cleanup script keeps the base minimal so you tweak it to your use case instead of deleting code.

**Is it free for commercial use?**
Yes. MIT-licensed and free for both personal and commercial projects: no paid tier, no license keys.

**How do I remove demo pages or features I don't need?**
Run `bun run cleanup --interactive` and pick what to strip, or `bun run cleanup --list` to see what can be removed.

**Does it support Next.js 16, React 19, and Tailwind CSS v4?**
Yes. The template is built on Next.js 16 (App Router), React 19, and Tailwind CSS v4, with shadcn/ui on Base UI primitives, and is actively maintained to track new releases.

**Can I use npm instead of Bun?**
Yes. Bun is preferred, but npm works too, and the repo even ships both Node.js and Bun Dockerfiles for deployment.

**Does it work with AI coding assistants?**
Yes. The repo ships AGENTS.md and CLAUDE.md with the project's conventions, plus a bundled Claude Code skill (`.claude/skills/kiranism-shadcn-dashboard`) that teaches agents how to add pages, tables, forms, and navigation the template way. Works with Claude Code, Cursor, and any tool that reads AGENTS.md.

**What data fetching pattern does it use?**
TanStack React Query with the official SSR pattern: `prefetchQuery` on the server, `HydrationBoundary` with `dehydrate` for hydration, and `useSuspenseQuery` on the client, plus nuqs for URL-synced search-param state. Mutations invalidate the cache on success.

**How do I deploy it?**
Deploy to Vercel out of the box, or use the included Docker setups: a Node.js Dockerfile and a Bun Dockerfile, both using Next.js standalone output mode. See the [deployment guide](./docs/deployment.md).

## Deploy

Deploy to Vercel out of the box, or use the included Docker setups: a Node.js Dockerfile and a Bun Dockerfile, both using Next.js standalone output mode. Full guide: [docs/deployment.md](./docs/deployment.md).

### Support

If this template saved you some time, a star is appreciated. You can also [buy me a coffee](https://buymeacoffee.com/kir4n) if you'd like.

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?style=flat-square&logo=buymeacoffee)](https://buymeacoffee.com/kir4n)

<!--

SEO keywords:

open source admin dashboard, nextjs admin dashboard, nextjs dashboard template,

shadcn ui dashboard, admin dashboard starter, next.js 16, typescript dashboard,

dashboard ui template, nextjs shadcn admin panel, react admin dashboard,

tailwind css admin dashboard, production ready admin dashboard template,

free react admin dashboard, nextjs 16 dashboard starter, working crud dashboard

-->

