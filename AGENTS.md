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

- **The artifact is gated in `postbuild`, not CI** — CI never builds, Vercel does. **`postbuild` is
  proven to run**: a real production log ([ADR-1081](docs/DECISIONS.md)) shows `Running "pnpm run
  build"`, then `prebuild`, then `postbuild` printing its gates. `vercel.json` now pins
  `buildCommand: pnpm build` so a dashboard edit cannot silently take the lifecycle away. **Five
  gates run there and fail the build** (four wired and proven on real artifacts as of #2194,
  2026-08-19 — LIVE-035/LIVE-048/LIVE-029 closed; the fifth, `check:build-fanout`, joined on
  2026-09-05 (ADR-1211) and awaits its first production reading):
  - `check:build-budget` — total per-function output under 8 GB; **6.66 GB across 497 functions on
    the PRODUCTION build of `main` at e3cec7af2, 2026-08-25 21:43Z (#2308)** — the first FALL in the
    series, by 0.01 GB and one function, after the two rises below. Previously **measured 6.67 GB across 498
    functions on the PRODUCTION build of `main` at c8b5ee97, 2026-08-25 09:50Z** (the deploy carrying
    all four meta-scan phases), after 6.55 GB / 496 fns the same day (#2280 and #2285, two independent
    previews), 6.02 GB / 496 fns (#2245, 2026-08-24), 6.03 GB / 497 fns (#2243, same day), 6.04 GB /
    499 fns (2026-08-18), 5.81 GB (2026-08-13) and 5.59 GB before that. This sentence once read "two
    consecutive readings have now fallen"; ⚠️ **that is long retired — the series has now risen twice
    in one day, +0.53 GB and then +0.12 GB.** At **83%** of its ceiling the headroom is still real,
    and the trend is still the thing to watch rather than the number. Largest single cost, named by
    the gate itself: **1510 MB of libvips (17.4 MB × 87 functions)** — which is `sharp`, so this gate
    and `check:og-trace` below are measuring two faces of one thing.
  - `check:og-trace` — **69 incidental functions of a 100 budget, HELD across three consecutive
    production deploys (c8b5ee97, 1386abe6c, e3cec7af2), 2026-08-25**, up from 67
    on 2026-08-24. ⚠️ Read the number carefully: the budget counts the functions that carry `sharp`
    WITHOUT rasterising a card (69), not the total that carry it (18 rasterisers + 69 = 87). The +2
    is the two per-entity OG routes added by meta-scan phase 2 (#2289) — that PR's own body said
    "headroom is unchanged at 67/100", which was wrong by exactly the routes it added. Two more cards
    cost two more; the budget is a fan-out ceiling, not a card ceiling.
  - `check:cache-budget` ([ADR-1064](docs/DECISIONS.md), [ADR-1086](docs/DECISIONS.md)) — the build
    cache under Vercel's packed 1.50 GB ceiling, trimming only a named compiler-cache list when over.
    It earned its wiring the hard way: the first version **killed two builds** (raw-vs-packed
    threshold ~2:1 off, and a biggest-first trim that deleted the **incremental fetch cache**,
    hanging *Collecting page data* until `BUILD_EXCEEDED_MAXIMUM_TIME` at 46 minutes, against a
    59-second control). Both defects are fixed and **proven by mutation tests** that reconstruct the
    exact bad trim (#2194); `PACKED_PER_RAW` was **settled at 0.53 by a paired real reading**
    (measured 0.5254 beside the same build's upload line, rounded toward firing early). A re-added
    `--warn-only` fails CI as a silent demotion. ✅ **The ratio is mix-dependent, and it was re-measured
    on 2026-08-24 (`HYG-015` closed, [ADR-1113](docs/DECISIONS.md)): the answer is "real but
    immaterial".** Five paired readings that day — three printing an estimate beside their own
    `Uploading build cache` line (1.26/1.25, 1.26/1.25, 1.28/1.27 GB), plus two production uploads on
    the same composition — put the implied ratio at **0.524–0.526 against a constant of 0.53**, i.e.
    accurate to 1% and rounded toward firing the trim early. The 2× gap is genuine for the OTHER mix:
    with `.next/cache` trimmed to nothing, node_modules alone packs near 0.264. It changes nothing,
    and the reason is structural rather than lucky — near the threshold the cache is compiler-heavy by
    definition, because being compiler-heavy is what makes it big enough to approach the threshold at
    all, and that is the mix 0.53 was derived on. So one constant is adequate by construction.
    🔴 **Do not lower it toward 0.264**: that measures on one mix and applies to another, which is the
    error this row exists to prevent, performed in reverse. The probe holds it in a two-sided
    0.52–0.54 band.
    🔴 **RE-MEASURED TWICE ON 2026-08-25, AND THE TWO READINGS DISAGREE — WHICH IS THE POINT.** The
    sentence above that used to close this paragraph ("the ratio only alters behaviour near the
    1.38 GB trim point, and 0.52 GB sits 62% below it") has been **removed**, because on one of those
    readings it was false, and reassurance that is only sometimes true is worse than none.
    - **#2280, mid-merge-run: 1.39 GB packed against a 1.40 GB trim point** — 99% of the line it
      trims at. On that mix the trim is **not a rare event**: the cache oscillates across the line and
      every trim costs the NEXT build a cold compile (113s against a 46s warm control, same day). The
      paired reading also had the estimate running **LOW** — 1.39 predicted, **1.42** uploaded — i.e.
      firing slightly *late*, the direction that costs a build rather than a CPU minute.
    - **`main` at c8b5ee97, production, 09:51Z: 1.27 GB packed** (2.24 GiB raw — node_modules 934 MiB
      + `.next/cache` 1359 MiB), **85% of the 1.50 GB ceiling and comfortably under the trim point**.
      And the paired reading is **EXACT**: the gate predicted 1.27 GB and `Uploading build cache`
      reported **1.27 GB**.
    - 🔴 **`main` at e3cec7af2, production, 21:43Z: 1.34 GB predicted, `Uploading build cache [1.34 GB]`
      — a FOURTH paired reading and the second EXACT one.** But read the direction, not just the
      accuracy: this is **+0.07 GB in twelve hours** (1.27 → 1.34), and the raw `.next/cache` grew
      1359 → 1476 MiB while node_modules held at 934 MiB, so the growth is entirely compiler cache.
      At **89% of the 1.50 GB ceiling** and roughly **96% of the trim point**, this gate is now much
      the closest of the four to firing, and the next build on this trajectory trims — which costs the
      build after it a cold compile (113s against a 46s warm control). The other three gates moved by
      0.01 GB, zero, and 1 KB across the same window.
      🔵 **AND THEN IT WENT BACK DOWN TWELVE MINUTES LATER: 1.27 GB on the 21:55Z preview** (turbopack
      1370 MiB against the 1476 MiB above), so read this column as a BAND, not a trend line. The
      sentence that stood here — "this one is the series to watch" — was written off two readings in
      one direction and is retired; a third reading in the other direction is what a band looks like,
      and drawing a trend through two points is how a normal oscillation gets mistaken for a climb.
      The honest statement is the range: this gate moves within roughly 1.27–1.39 GB on the current
      mix, its trim point is near 1.40, and it is still the closest of the four to firing — but it is
      not climbing toward it. ⚠️ A REFUTATION RIDES ON THIS: the growth here was proposed as a cause
      for the `Collecting page data` stalls (LIVE-123) and TESTED the same night. The build one minute
      before a captured 41-minute stall logged no trim at all. The mechanism does not operate; the
      cache is off that suspect list.
    - **`main` at 1386abe6c, production, 12:35Z: 1.28 GB predicted, 1.27 GB uploaded** (2.24 GiB raw —
      node_modules 934 MiB + `.next/cache` 1362 MiB), again **85%** of the ceiling. A THIRD paired
      reading on the same mix, accurate to 1%. The other three gates read IDENTICALLY to c8b5ee97 on
      this build — build-budget 6.67 GB / 498 fns, og-trace 69/100, shell-weight 1011 KB / 21 chunks —
      so the series is flat across two consecutive production deploys rather than still climbing.
    ✅ **Both are real, and the disagreement is the mix-dependence this paragraph already describes —
    not a defect in either measurement.** So the honest statement is the range, not a single figure:
    this gate sits between 85% and 99% of its trim point depending on what the cache is holding, it is
    the gate closest to firing at both ends, and `PACKED_PER_RAW` is accurate to within 2% on both.
    Re-derive it from paired readings before trusting a margin, and read `LIVE-123`
    for the page-data build failures measured in the same window.
    ✅ **The current reading, stated once (2026-09-04): this gate is a BAND, not a trend.** On the
    current mix the packed cache moves within roughly **1.27–1.39 GB** against a trim point near
    **1.40 GB**; four paired readings (1.27/1.27, 1.28/1.27, 1.34/1.34, 1.39/1.42) put the estimate
    within 2% of the upload line; and the series is **not trending** in either direction. It is still
    the closest of the four gates to its line, so a trim is possible on any build and costs the NEXT
    build a cold compile, but a trim is a normal event on this mix, not a regression. The paragraphs
    above are the measurement record that produced that sentence: they disagree with each other
    because each was written at a different point in the oscillation. Read them newest-last, and do
    not lift a single one of them out as "the" number. No reading later than 2026-08-25 exists.
  - `check:shell-weight` ([ADR-1066](docs/DECISIONS.md)) — the CLIENT half: the app shell's eager
    first-load JS (**1012 KB across 22 chunks, production e3cec7af2, 2026-08-25 21:43Z** — one
    kilobyte and one chunk above the 1011 KB / 21 it read hours earlier, which was itself one kilobyte above the 1010 KB
    it read on two artifacts a week earlier, ceiling 1,400 KB — **72%**, the most headroom of the
    four) plus named fingerprints for admin module bodies that must stay behind `next/dynamic` (all 8
    lazy, positive control present, 493 client-reference manifests read). Promoted from `--warn-only`
    in #2188 after two green production readings; the source-shape test pins the promoted state.
    ✅ **ARM C joined it on 2026-08-25 ([ADR-1140](docs/DECISIONS.md), `SCAN-506`) and does NOT run
    here.** Arms A/B measure the artifact, so `postbuild` is their only possible home; Arm C reads
    SOURCE — it walks each member hot route's static import graph and fails if a named heavy library
    is statically imported below a `use client` boundary — so it runs in
    `scripts/check-shell-weight.test.ts`, on every PR, which is earlier and equally strong. Reading:
    0 leaks, 668 client modules walked across four routes, 2 detector controls firing.

  **The rule that keeps being right:** a build-blocking gate that has never seen a real artifact is
  the 2026-08-11 incident with the roles reversed. `check:cache-budget` passed its own unit tests,
  ran clean locally, was reasoned about carefully — and was still wrong, by a factor of two, in a way
  only a real build could show. Wire a gate in the SAME change as the green build that proves it, and
  read what it prints before merging.
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

One shell, eight page shells, one chrome map. Full spec:
[`docs/PAGE-FRAMEWORK.md`](docs/PAGE-FRAMEWORK.md) §3 + §8. (This paragraph said "five templates"
until 2026-09-04; `components/templates/index.ts` exports eight, `scripts/check-templates.mjs`
counts eight, and PAGE-FRAMEWORK §8 reconciled the count on 2026-08-05. The text was behind the code.)

- **Pick a shell** from `@/components/templates` by *what the content is*, and fill its
  slots — never re-declare a header, card, or grid. The eight, by their exported names:
  **StreamTemplate** (a flow of items) · **IndexTemplate** (a collection to browse) ·
  **DetailTemplate** (one entity: context band + tabs) · **DashboardTemplate** (metric-led
  operator workspace) · **FocusTemplate** (a centered single-task body: compose, edit, settings) ·
  **WizardShell** (a multi-step flow; the Studio's `SparkShell` is its analogue for a Spark) ·
  **RailGrid** (the main-plus-rail column grid) · **AdminTemplate** (the operator workspace).
  `EventDetailTemplate` and `ListingDetailTemplate` are entity *compositions* over Detail, not
  shells; `PageHeading` / `PageHero` are shared header grammar, not shells.
- **The right rail shows on every member page.** Owner directive 2026-06-20, reaffirmed
  2026-07-28 (PAGE-FRAMEWORK §8.2). `lib/layout/page-chrome.ts` decides the rail in one pure
  function, `railFor(pathname)`, and the shell reads it; pages never toggle the rail themselves.
  **Adding a Focus page needs ZERO lines there**: a `FocusTemplate` body is centered and keeps the
  global rail beside it. "Focus" is a body shape, not a chrome exemption. `FOCUS_NONE_PREFIXES`
  and `SCOPED_PATTERNS` are both **empty by owner decision** — `'scoped'` still exists as a
  mechanism in `railFor`, with zero entries, because the one route that used it (the Channel
  detail page, ADR-885) was reverted the same night it deployed ("You dropped the right rail of
  the website. Fix that."). ADR-885's title still says `'scoped'` came back; the code says it did
  not, and the code wins (an amending ADR is being filed). Do not reach for `'none'` or `'scoped'`
  to fix a crowded page; the only non-`'global'` routes are the full-viewport takeovers, `/admin/*`,
  and the full-width editors, all already listed in `page-chrome.ts`.
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
- A field's `placement` (`spark` / `inline` / `rail`) is the intended ONE seam between creating and
  editing (the "one verb, two planes" model of ADR-450, spelled out in
  [`docs/EDITING-SYSTEM.md`](docs/EDITING-SYSTEM.md) §2 — ADR-450 itself has no numbered sections).
  ⚠️ **Today only the creating half consumes it.** `sparkFields()` drives the Spark; the edit-side
  selectors `inlineFields()` / `railFields()` in `lib/studio/kernel/review-kernel.ts` have no
  production call site (only their own test, verified 2026-09-04), so the edit rail is NOT yet
  derived from placement and nothing currently prevents the two from drifting. Keep declaring
  placement for all three (`FieldPlacement` is the three-value type in `lib/studio/kernel/manifest.ts`);
  wiring the edit rail to it is an open backlog row, not a shipped guarantee.

# Admin menu — a locked, machine-enforced contract (extend the catalog, never rewrite the rail)

The operator admin menu + rail + `/manage` consoles all derive from ONE source. Do NOT hand-roll
a per-scope menu, rewrite the rail to add an item, or reintroduce a parallel registry. Full spec:
[`docs/MENU-CONTRACT.md`](docs/MENU-CONTRACT.md) (ADR-553, **corrected by ADR-927 on 2026-08-04**
to describe what the code actually does). Enforced in CI by `pnpm check:menu` + the drift-guard
tests, so a violation fails the build — with one honest exception: 21 hand-declared rows are
carried as **frozen debt** (`FROZEN_MENU_DEBT` in `scripts/check-menu.mjs`, MENU-CONTRACT
§Frozen debt), a ratchet that may shrink and never grow.

- **To add or change a menu item:** edit a row in one of the **four registered catalogs**, the
  only places a menu row may be typed by hand (`REGISTERED_CATALOGS` in `scripts/check-menu.mjs`):
  `SPACE_MODULES` (`lib/admin/modules/space-modules.ts`, the Space menu) · `ADMIN_MODULES`
  (`lib/admin/modules/registry.ts`, every other scope) · `LAYOUT_MODULES` (`lib/widgets/modules.ts`,
  the page/layout blocks) · `STUDIO_LEAVES` (`lib/nav/studio.ts`, the operator destinations,
  ADR-848). The rail (`appsForScope`) and both consoles (`resolveSpaceMenu` / `resolveEntityConsole`)
  pick it up. A tweak is a data edit, not a render edit. (This bullet named two catalogs until
  2026-09-04; MENU-CONTRACT retired that count on 2026-08-04.)
- **Never** touch the rail render (`components/layout/settings-panel.tsx`, `lib/apps/*`,
  `components/layout/admin-bar/*`) to change what's IN the menu, and never re-declare a module
  catalog or a `*_SURFACES` registry outside those four. A genuinely new catalog is rare and has
  one supported path (MENU-CONTRACT §"A genuinely new catalog": register it in `REGISTERED_CATALOGS`
  + `APP_LANES` and wire its `APPS` lane in the same PR); anything else you think you need is a
  catalog row.
