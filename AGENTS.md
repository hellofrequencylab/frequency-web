<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Deploy safety — read BEFORE merging anything structural, and before debugging a failed deploy

`main` is protected and **merging deploys to production**, so a merge is a deploy. On 2026-08-11 a
215-file PR passed 26 contract guards, 9,000+ tests, lint and typecheck, and then killed every
production deploy with `ENOSPC` for a day: every gate measured the SOURCE, none measured the
ARTIFACT. Full rules and the incident: [`docs/DEPLOY-SAFETY.md`](docs/DEPLOY-SAFETY.md)
([ADR-1002](docs/DECISIONS.md), [ADR-1003](docs/DECISIONS.md)).

- **The artifact is gated in `postbuild`, not CI** — CI never builds, Vercel does. `check:build-budget`
  (total per-function output under 8 GB; **measured 5.81 GB across 499 functions, 2026-08-13**, up
  from 5.59 GB) and `check:og-trace` (sharp reaching 67 functions of a 100 budget) run on the real
  build and fail it. `check:shell-weight` ([ADR-1066](docs/DECISIONS.md)) is the CLIENT half — the app
  shell's eager first-load JS (**957 KB across 20 chunks, 2026-08-17**, ceiling 1,400 KB) plus named
  fingerprints for admin module bodies that must stay behind `next/dynamic` — and `check:cache-budget`
  ([ADR-1064](docs/DECISIONS.md)) trims the build cache. ⚠️ **Both are `pnpm check:` scripts, NOT in
  `postbuild` yet** (LIVE-035): neither has been run against a real completed production build, and a
  build-blocking gate that has never seen a real artifact is the 2026-08-11 incident with the roles
  reversed. Wire them in once a green build proves them.
- **When the budget gate fires, fix the fan-out, do not raise the budget.** Anything reachable from a
  root layout, a ROOT metadata file, or a shared server module is multiplied by every route beneath it.
  That rule has a client twin: anything statically reachable from `components/layout/app-shell.tsx`
  is parsed on every phone on every route under `app/(main)`, whether or not it renders.
- **Run the control before theorising** — redeploying the last known-good tree took three minutes and
  excluded platform, region, container and account in one shot. **Let builds finish**; cancelling
  destroys the evidence.
- **Every fail-safe needs a gate that notices it fired.** A swallowed error is an invisible regression.

# The one list — there is exactly one backlog, and it is not a document

**[`docs/BUILD-BACKLOG.json`](docs/BUILD-BACKLOG.json) is the ONLY record of what is done**
([ADR-1043](docs/DECISIONS.md)). Run **`pnpm backlog`** to see the working view.

- **Never open a new plan / TODO / roadmap / audit file.** `pnpm check:one-list` freezes the set of
  planning-shaped docs and fails a PR that adds one. Findings from an audit become **backlog entries**,
  not a new document. This repo consolidated into "the one master list" **five times** and drifted five
  times; the frozen set is what stops a sixth.
- **Never record status in prose.** Docs explain the work — specs, architecture and rationale are why
  this repo is legible. They do not track whether it is done, because prose cannot be verified. Every
  planning doc must say so in its first 25 lines; the gate checks it.
- **Every row states how it will be proven.** `pnpm check:backlog` runs each row's probe and fails
  **both ways**: a row marked `open` whose probe passes is stale, and a row marked `done` whose probe
  fails is a regression. It caught its 23rd stale item on its first run.
- **A probe measures the CONSEQUENCE, never the row's own title.** A `grep-present` for the words in
  the title passes by existing — the shape-not-truth failure named in four ADRs. Probe for the import
  that must be gone, the export that must exist, the command that must exit 0.
- **Rows a repo cannot probe are `manual`** with `evidence` + a `checked` date. They go stale loudly at
  120 days and **never fail the build** (ADR-970: a gate that cannot fire honestly gets routed around,
  and then it reads as coverage).
- **To close a row, make its probe pass — never delete the probe.** That is precisely how the previous
  five lists drifted.
- **🔴 RE-TEST A ROW'S PREMISE BEFORE YOU WORK IT, especially when the row says it cannot be tested.**
  A probe measures whether the work is done; nothing measures whether the row is still *true*. Five
  rows were re-measured on 2026-08-18 and five premises had expired ([ADR-1082](docs/DECISIONS.md)).
  Two were fixed by a PR nobody had circled back to (LIVE-012 and LIVE-043 both said the proxy never
  sets `next=`; #2132 had taught it to, five days earlier). Three said an agent could not look —
  *"an agent cannot see it"*, *"requires reading the repo Actions secrets, which is owner-only"* —
  and in every case the secret was unreadable but its **consequence** was printed in a log: a build
  log shows whether `postbuild` ran, and a CI log shows `VERCEL_AUTOMATION_BYPASS_SECRET: ***` and
  sixteen authenticated shell checks passing. **A blocker phrased as "cannot be checked" is a claim
  with an expiry date, and it is the cheapest thing in the backlog to get wrong**: those three rows
  sat on the owner for a week and each took one tool call.

# Which plan is live — read this before picking up "what's next"

The repo carries years of planning documents, and **five of them describe themselves as the
single source of truth**. Four are wrong. The live plan is:

- **[`docs/UX-MATURITY-PLAN.md`](docs/UX-MATURITY-PLAN.md)** (ADR-925) — the near-term program:
  eight lifts, each with its gate and its number. Its §Sequencing table says what ships next.
- **[`docs/BUILD-LIST.md`](docs/BUILD-LIST.md)** (ADR-921) — the phase runway around it, including
  the phases the owner has deliberately parked.
- **[`docs/DECISIONS.md`](docs/DECISIONS.md)** — the ADR record both cite. Recent decisions land
  here first; a plan doc that contradicts an ADR is stale, not authoritative.
- **[`docs/EDITOR-ARCHITECTURE.md`](docs/EDITOR-ARCHITECTURE.md)** (ADR-974…978) — the editor
  program, phases **E0–E10** in `BUILD-LIST`. **Read it before touching any block, block registry,
  or the page editor.** It supersedes `PAGE-EDITOR-SPEC` as the forward plan, re-sequences
  `WHITE-LABEL-SITES` (W1–W5 → E10), and amends `LOOM-PLATFORM` (six registries, not three;
  `library_usages` was dropped; Layer 1 is no longer git-only).

Every other planning file (`BUILD-SEQUENCE`, `MASTER-TODO`, `BUILD-CATALOG`, `A-PLUS-ROADMAP`,
`OPEN-THREADS`, `REMAINING-WORK`, `DEVELOPMENT-MAP`, `BACKLOG`, `MASTER-PLAN`, `BUILD-PHASES`,
`CHECKLIST`, `PATCH-LIST`) is history. Each carries a superseded banner. They are still worth
reading for items no current plan absorbed — but never for status.

**When the code and a plan doc disagree, the code wins**, and the doc gets fixed in the same pass.
The machine-readable state beats prose: `scripts/adoption-baselines.json` is the live design-debt
scoreboard, `supabase/migrations/` plus the project's ledger is the live schema state.

# Naming + voice — consult BEFORE writing or editing ANY copy

Two locked canons govern everything a member, visitor, or operator can read (UI
copy, notifications, practice/Journey/help pages, marketing, emails, error/empty
states, SEO/meta, AND every word any AI feature generates — Vera, blurbs, drafts):

- **[`docs/NAMING.md`](docs/NAMING.md)** — terminology. Always wins on names.
- **[`docs/CONTENT-VOICE.md`](docs/CONTENT-VOICE.md)** — demographic, voice, and
  SEO/AIO. The voice is "a camp counselor you actually respect": proper nouns carry
  the magic, sentences stay plain, never narrate the reader's feelings, pass the
  skeptic test. **No em dashes in brand copy.** Run its §10 checklist on every piece.

AI-generated copy must read these too: the shared primer in
`lib/ai/voice.ts` injects the rules into Vera and every generation path. If this
guide and the naming canon conflict, the naming canon wins on names.

# Documentation protocol (git ⇄ Notion) — follow on every change

When you plan or ship anything, route the docs by audience. Full spec:
[`docs/DOCS-PROTOCOL.md`](docs/DOCS-PROTOCOL.md).

- **Technical** (schema, migrations, code, APIs, config, decisions+rationale) →
  **git**: update the relevant `docs/*.md`; add an ADR to `docs/DECISIONS.md` for any
  decision. Code + `supabase/migrations/` are the source of truth.
- **Instructional** (how a human uses / operates / moderates / understands the live
  product; worldview, strategy) → **Notion** "Web Platform — Training & Strategy"
  database (data source `collection://96c71490-1114-4c73-9547-88b5140126ed`, under the
  Web Community page). **Update the existing subject page in place**; create a page only
  for a genuinely new subject. Never put changelogs/build-logs or copied code in Notion —
  link back to the git doc via the page's "Source of truth" property.
- **Neither** (pure refactor, no operator impact) → git only; no Notion page.

Keep Notion lean: one page per durable subject, instructional voice, link don't duplicate.

# Presentation standard — applies to everything we produce

Every artifact (doc, report, PR, email draft, in-product UI) is presentation-ready in
whatever surface it lands in. Polished is the default, not a finishing step. Full spec:
[`docs/PRESENTATION.md`](docs/PRESENTATION.md). Lead with the answer, prefer scannable
tables, use the ✅/⏳/⚠️/🔴 status legend, never hardcode hex in UI.

# Page framework — every interior page composes the kit (never hand-roll a layout)

One shell, five templates, one chrome map. Full spec:
[`docs/PAGE-FRAMEWORK.md`](docs/PAGE-FRAMEWORK.md) §3 + §8.

- **Pick a template** from `@/components/templates` by *what the content is*, and fill its
  slots — never re-declare a header, card, or grid:
  **Stream** (a flow of items) · **Index** (a collection to browse) · **Detail** (one
  entity: context band + tabs) · **Dashboard** (metric-led operator workspace) ·
  **Focus** (a centered, no-rail compose/edit/settings surface).
- **Register the rail** in one place — `lib/layout/page-chrome.ts` (`'global'` /
  `'scoped'` / `'none'`). The shell reads it; pages never toggle the rail themselves.
  Adding a Focus page = one line here, not an edit to `app-shell.tsx`.
- **Compose, don't author:** headers come from `PageHeading`, stats from `StatCard`,
  browse cards from `EntityCard`/`PersonCard`, sections from `SectionHeader`, empties from
  `EmptyState`. No `text-[10/11px]` content type; semantic tokens only.
- **Speed is structural:** Server Components by default; never block the shell on slow
  awaits — push them behind per-section `<Suspense>` (PAGE-FRAMEWORK §5).

# Creation wizards — a locked, machine-enforced contract (declare a manifest, never build a wizard)

Every creation wizard, review board, and edit re-entry derives from ONE source. Do NOT hand-roll a
per-entity wizard, review screen, or field style. Full spec: [`docs/STUDIO.md`](docs/STUDIO.md)
(ADR-986). Enforced in CI by `scripts/check-studio.test.ts` (the layering half) +
`lib/studio/registry.test.ts` (the manifests) — both under `pnpm test`. `pnpm check:studio` runs the
same guard locally and prints what to fix.

- **To add or change an entity's fields:** edit its manifest in `lib/studio/entities/*.ts` and
  register it in `lib/studio/registry.ts`. That is the whole change: the Spark, the review board,
  and the edit rail all derive from it.
- **To add a capability every entity should get** (a new control, signal, or mood): change
  `lib/studio/kernel/*`, adding a `FIELD_KIND` if it is a new control. Kernel change ⇒ every wizard.
- **The kernel is pure and entity-blind.** No React/Next/Supabase, and never an import from
  `lib/studio/entities/`. If you want to reach sideways, you want a field kind instead.
- A field's `placement` (`spark` / `inline` / `rail`) is the ONE seam between creating and editing
  (ADR-450 §2), so the two can never drift.

# Admin menu — a locked, machine-enforced contract (extend the catalog, never rewrite the rail)

The operator admin menu + rail + `/manage` consoles all derive from ONE source. Do NOT hand-roll
a per-scope menu, rewrite the rail to add an item, or reintroduce a parallel registry. Full spec:
[`docs/MENU-CONTRACT.md`](docs/MENU-CONTRACT.md) (ADR-553). Enforced in CI by `pnpm check:menu` +
the drift-guard tests, so a violation fails the build.

- **To add or change a menu item:** edit a row in `SPACE_MODULES`
  (`lib/admin/modules/space-modules.ts`) or `ADMIN_MODULES` (`lib/admin/modules/registry.ts`).
  The rail (`appsForScope`) and both consoles (`resolveSpaceMenu` / `resolveEntityConsole`) pick
  it up. A tweak is a data edit, not a render edit.
- **Never** touch the rail render (`components/layout/settings-panel.tsx`, `lib/apps/*`,
  `components/layout/admin-bar/*`) to change what's IN the menu, and never re-declare a `*_MODULES`
  catalog or a `*_SURFACES` registry elsewhere. If you think you need to, you don't — add a catalog row.
