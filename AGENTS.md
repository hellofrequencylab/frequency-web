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
  2026-09-05 (ADR-1211); its first real artifact, 2026-09-05 12:19Z, read **456 functions**, 2 icon
  chunks in 3 functions, 6 site photos at the 6 ceiling, and the floor moved 450 to 400 beside that
  reading because the 496 it was set against was three weeks stale):
  - `check:build-budget` — total per-function output under 8 GB. **6.27 GB across 456 functions**
    (production `18c997f`, 2026-09-05), 78% of ceiling, and flat across the three most recent
    production deploys. Largest single cost, named by the gate itself: ~1456 MB of libvips
    (17.8 MB x 82 functions) — that is `sharp`, so this gate and `check:og-trace` measure two
    faces of one thing. Watch the trend, not the number; the reading history lives in the PR
    bodies and `scratchpad`, not here.
  - `check:og-trace` — **18 rasterising routes + 64 incidental of a 100 budget** (same deploy).
    ⚠️ Read it carefully: the budget counts functions carrying `sharp` WITHOUT rasterising a card
    (64), not the total that carry it (82). It is a fan-out ceiling, not a card ceiling — each new
    per-entity OG route costs one.
  - `check:cache-budget` ([ADR-1064](docs/DECISIONS.md), [ADR-1086](docs/DECISIONS.md)) — keeps the
    build cache under Vercel's packed 1.50 GB ceiling, trimming only a named compiler-cache list
    when over. Packed size is estimated as `raw x PACKED_PER_RAW` (0.53, ADR-1113). **Current
    state: a BAND, not a trend** — on the resting mix the packed cache moves within roughly
    1.27-1.39 GB against a trim point near 1.40, and paired readings put the estimate within 2% of
    the upload line. A trim is a normal event, and it costs the NEXT build a cold compile.
    🔴 Two things to know before you touch the constant. (1) **Under many deploys in one day the
    band breaks**: 2026-09-05 put sixteen through and the last measured 3.06 GiB raw / ~1.74 GB
    packed and TRIMMED — the first recorded trim, and it saved a cache Vercel would have rejected
    whole. (2) On that loaded mix the estimate ran **LOW**, so the trim fires LATE, which costs a
    build rather than a CPU minute — the opposite of what ADR-1113 rounded it for. Do NOT lower it
    toward 0.264 (that measures one mix and applies it to another, in reverse). `LIVE-175` carries
    the re-derivation and the full measurement record; do not change the constant without a paired
    reading on a LOADED mix that proves the new value.
  - `check:shell-weight` ([ADR-1066](docs/DECISIONS.md)) — the CLIENT half: the app shell's eager
    first-load JS (**1012 KB across 22 chunks, production e3cec7af2, 2026-08-25 21:43Z** — one
    kilobyte and one chunk above the 1011 KB / 21 it read hours earlier, which was itself one kilobyte above the 1010 KB
    it read on two artifacts a week earlier, ceiling 1,400 KB — **72%**, the most headroom of the
    five) plus named fingerprints for admin module bodies that must stay behind `next/dynamic` (all 8
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

One shell, seven page shells, one chrome map. Full spec:
[`docs/PAGE-FRAMEWORK.md`](docs/PAGE-FRAMEWORK.md) §3 + §8. ⚠️ **Do not restate a count here — this
paragraph has now been wrong twice.** It said "five templates" until 2026-09-04 and then "eight"
until 2026-09-05, and the eight wrongly included `RailGrid`. The authoring menu below is seven;
`scripts/check-templates.mjs` is the enforced list and is deliberately WIDER (11 names) because it
answers a different question — "does this page compose anything that owns a layout", so it also
counts the two entity compositions, `SparkShell`, and two path-reached aliases. Read `SHELLS` there
for what CI enforces; read the menu here for what to pick.

- **Pick a shell** from `@/components/templates` by *what the content is*, and fill its
  slots — never re-declare a header, card, or grid. The seven, by their exported names:
  **StreamTemplate** (a flow of items) · **IndexTemplate** (a collection to browse) ·
  **DetailTemplate** (one entity: context band + tabs) · **DashboardTemplate** (metric-led
  operator workspace) · **FocusTemplate** (a centered single-task body: compose, edit, settings) ·
  **WizardShell** (a multi-step flow; the Studio's `SparkShell` is its analogue for a Spark) ·
  **AdminTemplate** (the operator workspace).
  `EventDetailTemplate` and `ListingDetailTemplate` are entity *compositions* over Detail, not
  shells; `PageHeading` / `PageHero` are shared header grammar, not shells. 🔴 **`RailGrid` is NOT
  a shell** — it is the main-plus-rail column grid, a layout primitive you use *inside* a shell.
  `check-templates.mjs` lists it under `PIECES` ("deliberately NOT shells"), so a page whose only
  layout import is `RailGrid` fails that gate. This doc listed it as a shell until 2026-09-05.
- **The right rail shows on every member page.** Owner directive 2026-06-20, reaffirmed
  2026-07-28 (PAGE-FRAMEWORK §8.2). `lib/layout/page-chrome.ts` decides the rail in one pure
  function, `railFor(pathname)`, and pages never toggle the rail themselves. ⚠️ `railFor` is the
  code DEFAULT, not the final answer: the shell resolves
  `mergeChrome(railFor(pathname), overrides, pathname)`, so a stored operator override saved at
  `/admin/page-layout` (table `page_chrome_overrides`) can beat it. **Chasing a missing rail in
  production? Read that table before you read this file** — the code alone cannot tell you.
  **Adding a Focus page needs ZERO lines there**: a `FocusTemplate` body is centered and keeps the
  global rail beside it. "Focus" is a body shape, not a chrome exemption. `FOCUS_NONE_PREFIXES`
  and `SCOPED_PATTERNS` are both **empty by owner decision** — `'scoped'` still exists as a
  mechanism in `railFor`, with zero entries, because the one route that used it (the Channel
  detail page, ADR-885) was reverted the same night it deployed ("You dropped the right rail of
  the website. Fix that."). ADR-885's title still says `'scoped'` came back; the code says it did
  not, and the code wins — [ADR-1202](docs/DECISIONS.md) amends it (filed 2026-09-04; this line
  read "an amending ADR is being filed" until 2026-09-05, a standing to-do for work already done).
  Do not reach for `'none'` or `'scoped'` to fix a crowded page; the only non-`'global'` routes
  **in code** are the full-viewport takeovers, `/admin/*`, and the full-width editors, all listed
  in `page-chrome.ts` — which is the enumeration to read, rather than any restatement of it.
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
