<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# How to read this file

This is the **session index**, not a second copy of the canons. Each locked contract lives in one doc. If this file and that doc disagree, **the canon wins**, and this file gets shortened, not restated. Readings, counts, and "what shipped last week" live in PR bodies and `pnpm backlog`, never here ([ADR-1355](docs/DECISIONS.md), [ADR-1446](docs/DECISIONS.md)).

Orientation for a human: [`docs/START-HERE.md`](docs/START-HERE.md).

| If you are about to… | Read this, then stop restating it |
|---|---|
| Merge, debug a deploy, touch a `postbuild` gate, or add a route | [`docs/DEPLOY-SAFETY.md`](docs/DEPLOY-SAFETY.md) |
| Pick up work, file a finding, or close a row | [`docs/BUILD-BACKLOG.json`](docs/BUILD-BACKLOG.json) · `pnpm backlog` · `pnpm packets` |
| Name something a human will read | [`docs/NAMING.md`](docs/NAMING.md) then [`docs/CONTENT-VOICE.md`](docs/CONTENT-VOICE.md) |
| Change a page layout | [`docs/PAGE-FRAMEWORK.md`](docs/PAGE-FRAMEWORK.md) |
| Add or change a create/edit field | [`docs/STUDIO.md`](docs/STUDIO.md) |
| Touch a payment button | [`docs/CHECKOUT.md`](docs/CHECKOUT.md) |
| Add an admin / Space menu item | [`docs/MENU-CONTRACT.md`](docs/MENU-CONTRACT.md) |
| Route a doc after a change | [`docs/DOCS-PROTOCOL.md`](docs/DOCS-PROTOCOL.md) |
| Write a PR, report, or in-product empty state | [`docs/PRESENTATION.md`](docs/PRESENTATION.md) |
| Touch a block, block registry, or the page editor | [`docs/EDITOR-ARCHITECTURE.md`](docs/EDITOR-ARCHITECTURE.md) |

# Deploy safety

`main` is protected. **Merging deploys to production.** The 2026-08-11 outage: a green source tree shipped an artifact the container could not hold. Full incident and rules: [`docs/DEPLOY-SAFETY.md`](docs/DEPLOY-SAFETY.md).

- **The artifact is gated in `postbuild`, not CI.** CI never builds. Vercel runs `pnpm build` (`vercel.json` pins it). Six gates fail that build: `check:build-budget`, `check:og-trace`, `check:cache-budget`, `check:shell-weight`, `check:build-fanout`, `check:notfound-routes`. Watch the trend those gates print. Do not paste a reading into this file.
- **When a budget gate fires, fix the fan-out, do not raise the budget.** Anything reachable from a root layout, a ROOT metadata file, or a shared server module is multiplied by every route beneath it. Client twin: anything statically reachable from `components/layout/app-shell.tsx` is parsed on every phone on every `app/(main)` route.
- **Run the control before theorising.** Redeploy the last known-good tree before inventing a platform story. Let builds finish; cancelling destroys the evidence.
- **Every fail-safe needs a gate that notices it fired.** A swallowed error is an invisible regression.
- A build-blocking gate that has never seen a real artifact is the 2026-08-11 incident with the roles reversed. Wire the gate in the same change as the green build that proves it.

# The one list

**[`docs/BUILD-BACKLOG.json`](docs/BUILD-BACKLOG.json) is the only record of what is done** ([ADR-1043](docs/DECISIONS.md)). `pnpm backlog` is the working view. `pnpm packets` is the next agent-workable row per derived lane.

- **Never open a new plan / TODO / roadmap / audit file.** `pnpm check:one-list` freezes that set. Findings become backlog rows.
- **Never record status in prose.** Specs and ADRs explain the work. Every planning doc must point at the JSON in its first 25 lines, or carry a SUPERSEDED banner.
- Every open row has `priority` (P0–P3) and a `verify` probe that measures a **consequence**. `pnpm check:backlog` fails both ways (stale `open`, regressed `done`).
- Close a row by making its probe pass. Never delete the probe.
- **Re-test a row's premise before you work it**, especially when it says it cannot be checked ([ADR-1082](docs/DECISIONS.md)).
- After a ready PR, arm squash auto-merge. Stay off `cursor/cloud-agent-workspace-8978`. One row per PR. Never merge red.

# Which plan is live

Status is the JSON. These four docs explain the work; they do not track it:

- [`docs/UX-MATURITY-PLAN.md`](docs/UX-MATURITY-PLAN.md) — near-term program (ADR-925).
- [`docs/BUILD-LIST.md`](docs/BUILD-LIST.md) — phase runway, including parked phases (ADR-921).
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — ADRs. A plan that contradicts an ADR is stale.
- [`docs/EDITOR-ARCHITECTURE.md`](docs/EDITOR-ARCHITECTURE.md) — editor program E0–E10. Read before any block or page editor.

`BUILD-SEQUENCE`, `MASTER-TODO`, `BUILD-CATALOG`, `A-PLUS-ROADMAP`, `OPEN-THREADS`, `REMAINING-WORK`, `DEVELOPMENT-MAP`, `BACKLOG`, `MASTER-PLAN`, `BUILD-PHASES`, `CHECKLIST`, `PATCH-LIST` are history. Each has a superseded banner. Do not update them for status.

When the code and a doc disagree, **the code wins**, and the doc is fixed in the same pass.

# Naming, voice, docs, presentation

- **Names:** [`docs/NAMING.md`](docs/NAMING.md) always wins.
- **Voice:** [`docs/CONTENT-VOICE.md`](docs/CONTENT-VOICE.md). Camp counselor you actually respect. No em dashes in brand copy. AI paths read `lib/ai/voice.ts`.
- **Docs router:** technical → git (`docs/` + ADR). Instructional / operator → Notion training DB (`collection://96c71490-1114-4c73-9547-88b5140126ed`), update in place. Member how-to → `content/help/`. Full spec: [`docs/DOCS-PROTOCOL.md`](docs/DOCS-PROTOCOL.md).
- **Presentation:** [`docs/PRESENTATION.md`](docs/PRESENTATION.md). Lead with the answer. No hardcoded hex in UI.

# Locked product contracts (do the small change, not a parallel system)

**Pages.** Pick a shell from `@/components/templates` by what the content is: Stream, Index, Detail, Dashboard, Focus, WizardShell, Admin. `RailGrid` is a layout primitive, not a shell. The right rail is on every member page; `railFor(pathname)` is the code default and a stored override can beat it. Compose `PageHeading`, `StatCard`, `EntityCard`, `EmptyState`. Server Components by default; slow work behind `<Suspense>`.

**Wizards.** Edit `lib/studio/entities/*.ts` and register it. Kernel change → every wizard. The kernel stays entity-blind. Placement (`spark` / `inline` / `rail`) is the create/edit seam; rails derive from `*-rail-plan.ts`.

**Checkout.** Route both halves through `lib/billing/checkout-ui.ts` and render `components/billing/checkout-panel.tsx`. `!session.url` is true for every on-page session. A fallback must pass `forceHosted`. Status values are per-table; read the live constraint.

**Admin menu.** Add a row in one of the four registered catalogs (`REGISTERED_CATALOGS` in `scripts/check-menu.mjs`). Never rewrite the rail to add an item. Frozen menu debt may shrink and never grow except the OWN-058 raise (11 → 13) that admitted Circle and Event Settings doors; the count lives in `scripts/check-menu.mjs` and MENU-CONTRACT.

Product-first ([ADR-1403](docs/DECISIONS.md)): do not start Editor / Sites / Etsy / App Platform from a scan or a docs pass.
