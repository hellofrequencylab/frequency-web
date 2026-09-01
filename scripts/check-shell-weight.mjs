#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// A CEILING ON WHAT EVERY MEMBER DOWNLOADS BEFORE THE PAGE RESPONDS (ADR-1066).
//
// 🔴 THE GAP THIS CLOSES, NAMED BY THE COMMIT THAT COULD NOT CLOSE IT. dc47b89 ("The operator admin
// console stops shipping to every member") found that `app/(main)/layout.tsx` → `app-shell.tsx` →
// `AdminBar` → `settings-panel.tsx` → `module-map.tsx` → 42 admin modules had NO code-split boundary
// anywhere on the path. Every member page carried the entire OPERATOR console; `admin-bar.tsx` then
// returned null unless the viewer could open the rail, so members downloaded and parsed all of it to
// render nothing. Measured: 2.78 MB eager JS on the median app/(main) route against 1.30 MB outside
// the shell; FCP p75 4,623 ms against 3,274 ms; TTFB p75 155 ms — the SERVER was never the problem.
//
// That commit fixed it in one file and ended with: "⚠️ THERE IS NO GUARD FOR THIS, and that is the
// structural finding. The repo gates the SERVER artifact (check:build-budget) and has NOTHING
// measuring client first-load JS, which is how 1.8 MB accumulated unnoticed." This is that guard.
//
// ⚠️ WHY IT IS AN ARTIFACT GATE AND NOT A SOURCE GREP. The thing that costs a member money is the
// bytes their phone parses, and no source rule computes that: `dynamic()` and a static import are
// one keyword apart in review and 1.6 MB apart in the build. So this reads `.next` — the real chunk
// files the real build wrote — exactly like check:build-budget and check:og-trace, and for the same
// reason (DEPLOY-SAFETY.md rule 1: every gate in this repo measured the SOURCE and none measured the
// ARTIFACT, which is how the 2026-08-11 outage walked through 26 green guards).
//
// WHAT IT MEASURES. `entryJSFiles['[project]/app/(main)/layout']` in any route's client-reference
// manifest IS the shell's eager first-load JS: the chunks the browser must fetch and parse before
// the shell hydrates, on every one of the ~300 routes underneath it. Two arms over that set:
//
//   ARM A · a byte ceiling on the whole set, so the general class ("the shell got heavier") fires.
//   ARM B · named module bodies that MUST stay lazy must not appear in it, so the specific
//           regression ("someone tidied a `dynamic()` back into a static import") fires by name.
//
// Arm B is the one with teeth, and it is the method dc47b89 used to prove the bug was real: the
// string "This nexus is archived" exists only in nexus-danger-module.tsx, and it was found inside a
// shell chunk every member downloads. A fingerprint in the shell's eager chunks is not evidence of
// a module being *near* the shell — it is the module's compiled body, in the bytes, on every route.
//
//   ARM C · THE ROUTE CHUNK (SCAN-506). Arms A and B watch ONE manifest entry, the shell layout.
//           A heavy library pulled in by a ROUTE's own client component is invisible to both: it
//           never enters the shell entry, it lands in that route's chunk, and every member who
//           opens that route pays for it. That blind spot is documented above ("what became
//           statically reachable from app-shell.tsx") and it is a real escape, not a theoretical
//           one — SCAN-302 found react-markdown on the feed path by hand, which is how this arm
//           came to exist. Arm C is the SOURCE half of that class: from each member hot route's
//           `page.tsx` it walks the static import graph, marks everything below the first
//           `'use client'` boundary as client code, and fails if a NAMED heavy module is statically
//           imported anywhere inside that subtree.
//
// ⚠️ ARM C IS FILESYSTEM-ONLY AND SAYS SO OUT LOUD, because that is the thing about it most likely
// to be over-read later. It runs with or without `.next` and it measures REACHABILITY, not bytes:
//   • It is a FINGERPRINT arm, the route-level twin of Arm B, never a budget. A heavy dependency
//     nobody has NAMED in HEAVY_CLIENT_MODULES is not caught. There is no route byte ceiling here,
//     because computing one honestly needs the artifact and the artifact needs a build.
//   • What it CAN prove without a build is the half a build cannot prove cheaply: a static import
//     from inside a client subtree is not code-split by any bundler setting, so "statically
//     imported below a 'use client' boundary on this route" IS "in this route's first-load JS".
//     `dynamic()` and bare `import()` are not static edges, so they are correctly invisible to it.
//   • It cannot see a bundler/chunking change that voids the split. Only Arms A and B can, and only
//     on the artifact. Neither half is redundant — this is the same two-half split
//     scripts/check-shell-weight.test.ts describes for Arms A/B, arrived at from the other side.
//
// ✅ ARM C IS ENFORCED AT PR TIME, IN scripts/check-shell-weight.test.ts — NOT in `main()` below.
// Arms A/B measure the artifact, so `postbuild` is their only possible home; Arm C reads source, so
// `pnpm test` is its only honest one (the note above `main()` says why wiring it into postbuild was
// wrong in both directions). Everything that wiring needs is exported from here: HOT_ROUTE_ENTRIES,
// HEAVY_CLIENT_MODULES, ROUTE_HEAVY_CONTROLS, CLIENT_GRAPH_FLOOR, walkRouteClientGraph,
// staticModuleEdges, declaresUseClient, heavyModulesIn. Both controls are asserted there too, so
// "no leaks" can never mean "nothing was examined".
//
// Runs as `postbuild`, so it runs on Vercel's real build. CI never builds.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, existsSync, statSync, globSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

// ── WARN-ONLY: the stage between "never run on a real artifact" and "enforcing" ──────────────
// This gate has ONE reading in its whole life, and that reading is unconfirmed in BOTH directions:
// it exited 1 naming lib/pricing/feature-meters.ts, on an artifact built plausibly BEFORE
// settings-panel.tsx moved five editor bodies behind dynamic(). So nobody knows whether it is
// reporting a real leak or a stale one, and the only way to find out is to run it on a real build.
// Wiring it BLOCKING to find out is the 2026-08-11 incident with the roles reversed -- the exact
// trap its sibling check:cache-budget fell into on 2026-08-18, killing two builds.
//
// So it takes the same third option the owner approved for that sibling. `--warn-only` measures and
// prints, and CANNOT exit non-zero: not on the budget arm, not on the fingerprint arm, not on a
// missing manifest, not on its own crash. There is no input that lets this line fail a production
// deploy. What it buys is the reading, on a real artifact, in a log we read.
//
// ⚠️ A STAGE, NOT A DESTINATION. A gate that only warns is one everyone learns to scroll past
// (ADR-970). Promote it in the SAME change as the green build whose numbers confirm it, and delete
// this flag from postbuild when you do.
const WARN_ONLY = process.argv.includes('--warn-only')

if (WARN_ONLY) {
  process.on('uncaughtException', (err) => {
    console.log(
      `\n🔴 check:shell-weight (warn-only) CRASHED and is being ignored so it cannot fail this ` +
        `build: ${err && err.stack ? err.stack : err}\n` +
        `   No measurement was taken, so this build tells us nothing about the shell. Fix the ` +
        `script before promoting it to blocking (LIVE-035).\n`,
    )
    process.exit(0)
  })
}

/** Exit with `code`, unless warn-only -- then say so plainly and leave with 0. */
const bail = (code) => {
  if (WARN_ONLY) {
    console.log('\n   (warn-only: reported above, NOT failing this build. LIVE-035.)\n')
    process.exit(0)
  }
  process.exit(code)
}

const ROOT = process.cwd()
const NEXT_DIR = path.join(ROOT, '.next')

/** The manifest key for the shell layout. Everything under `app/(main)` renders inside it, so a byte
 *  added here is a byte multiplied by every route in the shell — the client-side twin of the
 *  root-layout fan-out rule in DEPLOY-SAFETY.md. */
export const SHELL_ENTRY = '[project]/app/(main)/layout'

/** The files on the shell's static path that mount admin bodies. Every admin component they name
 *  must be reached through `next/dynamic`; a static import from either one is the regression.
 *  `scripts/check-shell-weight.test.ts` asserts this at PR time, because THIS script only runs in
 *  `postbuild` — i.e. on Vercel, where a failure is already a failed deploy. */
export const LAZY_MOUNT_SITES = [
  'components/layout/settings-panel.tsx',
  'components/admin/modules/module-map.tsx',
]

/** ── THE THREE THINGS THE RAIL MUST HAVE SYNCHRONOUSLY ────────────────────────────────────────
 *
 *  The rule the sites above are held to is "no static import of an admin module", and these are the
 *  declared exceptions. Each is here because the rail must consult it BEFORE it can decide what
 *  sections exist — a decision that cannot wait on a chunk without the rail rendering empty boxes
 *  and `hasContent` going wrong. None of them renders a surface body.
 *
 *  ⚠️ IT IS A RATCHET: this list may SHRINK, never grow. Every entry carries its MEASURED cost in
 *  the shell's static client graph (2026-08-17, source bytes reachable from app-shell.tsx), because
 *  an allowlist without numbers is where the next 1.6 MB hides. Anything that renders a body belongs
 *  behind `next/dynamic`, however small it looks today. */
export const SYNCHRONOUS_ADMIN_IMPORTS = [
  // The KEY SET of the id -> component map, and nothing else. `nodeForApp` needs it synchronously:
  // an id with no inline body draws nothing, and that decision feeds the section count. 1 file,
  // 3.7 KB, ZERO imports — it is 38 strings in a `Set`, and most of the file is the comment saying why.
  //
  // ⚠️ IT USED TO BE `module-map` ITSELF (LIVE-009): 14.3 KB of registry plus 42 `next/dynamic`
  // loader stubs and the chunk-manifest entries naming their 42 chunks, imported into the shell to
  // answer a membership test. The values are now reached through `AdminModuleBody`, which
  // `settings-panel.tsx` mounts with `dynamic()`. The ratchet shrank in weight, not in length:
  // three entries, but the biggest one no longer references a single component.
  '@/components/admin/modules/module-ids',
  // The plain link row a `link` surface draws. 1 file, 1.9 KB — no data, no imports of its own worth
  // splitting, and it is on the path for nearly every row.
  '@/components/admin/modules/surface-link-row',
  // The summary DATA map. `SURFACE_SUMMARIES[id]` is the card-vs-row branch itself. 1 file, 6.0 KB;
  // its getters are `'use server'`, so they are a reference stub in the browser, not a body.
  '@/components/admin/modules/surface-summaries',
]

// ── ARM A · THE BUDGET ──────────────────────────────────────────────────────────────────────
// MEASURED, paired A/B on one tree, 2026-08-17 (only `settings-panel.tsx` differs between the two
// builds), with the 42 catalog modules, the five hand-mounted editor bodies and the surface summary
// card all behind `dynamic()`:
//
//     before ADR-1066   1,023 KB raw / 299 KB gzip, 22 chunks   ← Arm B named all six bodies
//     after             957 KB raw   / 280 KB gzip, 20 chunks
//
// Arm A is deliberately the loose arm: 66 KB is well inside any budget worth setting, which is
// exactly why Arm B exists. The byte ceiling catches "the shell doubled"; only the fingerprints
// catch "one module came back".
//
// Why 1,400 and not 1,100: this number must survive ordinary shell work — a new nav surface, an
// icon set, a provider — without anyone reaching for the constant, because a budget that gets raised
// routinely stops being a budget. ~375 KB of headroom is roughly a third again of the current shell.
//
// Why 1,400 and not 2,000: it still fires on the regression that actually happened. Re-inlining the
// admin console put the median app/(main) route at 2.78 MB (dc47b89's measurement); the shell entry
// carried ~1.6 MB of that. Either half of the class overshoots 1,400 KB immediately, so this ceiling
// cannot launder it.
//
// It is a RATCHET in spirit: it may FALL, and raising it is a decision that needs a measurement and
// a paragraph in the commit — the same standard check:build-budget and check:og-trace hold.
export const BUDGET_KB = 1400

// ── ARM B · THE FINGERPRINTS ────────────────────────────────────────────────────────────────
// Each row is: a literal that survives minification, and the ONE source file it lives in. Every row
// names a component that is mounted through `next/dynamic` today and whose body must therefore never
// be in the shell's eager chunks.
//
// ⚠️ THESE ARE NOT DECORATION, AND THEY ARE CHECKED BOTH WAYS (see the non-vacuity arm below). A
// fingerprint that no longer exists in its source file, or that cannot be found anywhere in the
// build, FAILS this guard rather than quietly passing — because "absent from the shell chunks" is
// worthless if the string was never findable in the first place. That is the shape-not-truth failure
// this repo has named in four ADRs, and a fingerprint guard is the easiest possible place to make it.
//
// If a copy edit breaks one, the fix is to pick a new literal from the same file, not to delete the
// row. The row count may grow; it should not shrink without the module ceasing to exist.
export const FINGERPRINTS = [
  // The 42 catalog modules, behind `dynamic()` in components/admin/modules/module-map.tsx (dc47b89).
  // This exact string is the one dc47b89 used as its proof the console was really shipping.
  { text: 'This nexus is archived', source: 'components/admin/modules/nexus-danger-module.tsx' },
  { text: 'You can take the offer back any time before they answer.', source: 'components/admin/modules/circle-move-module.tsx' },
  // The five bodies settings-panel.tsx mounts by hand — the `allExtraItems` frozen debt
  // (MENU-CONTRACT.md) plus the operator "Page" group — behind `dynamic()` since ADR-1066.
  { text: 'It is off the calendar. Reinstate it to bring it back.', source: 'components/admin/modules/event-danger-zone.tsx' },
  { text: 'The journeys and practices your group has taken on.', source: 'components/admin/modules/circle-quest-module.tsx' },
  { text: 'Headline (not editable)', source: 'components/admin/modules/page-content-module.tsx' },
  { text: 'Set the line shown under the page title.', source: 'components/admin/page-settings/page-settings-module.tsx' },
  { text: 'Row header (optional)', source: 'components/admin/page-settings/layout-editor.tsx' },
  // NOT an admin module: the pricing catalog, reached only through `surface-summary-card.tsx`'s
  // allowance nudge. It was 8 modules and ~160 KB of plans/tiers/keys on every member page, to
  // render a meter only an operator sees. This row is what notices if that door reopens.
  { text: 'Preview only, and be a Collaborator on other Spaces for free', source: 'lib/pricing/feature-meters.ts' },
]

/** The POSITIVE CONTROL. Shell chrome copy that is unconditionally in the shell's eager JS. If this
 *  is missing, the guard is reading the wrong files or the wrong build, and every "absent" verdict
 *  above means "I never looked" rather than "I looked and it was fine". Fail rather than report a
 *  green built on nothing — this is the same non-vacuity floor scripts/guard-wiring.test.ts keeps. */
export const CONTROL = { text: 'My Frequency', source: 'components/layout/my-frequency-menu.tsx' }

/** STATIC imports of an `@/components/admin/**` module, as source text.
 *
 *  Pure and exported so `scripts/check-shell-weight.test.ts` can run it in CI on the real files —
 *  the arm that catches the regression on the PR rather than on the deploy. `import type` is erased
 *  by the compiler and is not a runtime edge, so it is not a violation. */
export function staticAdminImports(source) {
  const out = []
  const re = /(?:^|\n)\s*import\s+(?!type[\s{])([^'"()]*?)\s*from\s*['"](@\/components\/admin\/[^'"]+)['"]/g
  let m
  while ((m = re.exec(source))) {
    const clause = m[1].trim()
    // `import { type A, type B } from ...` is also fully erased.
    const braces = /\{([^}]*)\}/.exec(clause)
    if (braces && !clause.slice(0, braces.index).replace(/,\s*$/, '').trim()) {
      const names = braces[1].split(',').map((s) => s.trim()).filter(Boolean)
      if (names.length > 0 && names.every((n) => /^type\s/.test(n))) continue
    }
    out.push(m[2])
  }
  return out
}

// ── ARM C · THE ROUTE CHUNK (SCAN-506) ───────────────────────────────────────────────────────
// The member hot routes. Deliberately `page.tsx` and NOT the layout: the layout IS the shell, and
// the shell is what Arms A and B already measure to the byte. What this arm adds is the delta a
// route contributes ON TOP of the shell, which is the half nothing was watching.
//
// A missing entry is a FAILURE, not a skip. A route file that moved would silently reduce this arm
// to "I looked at three routes and one empty string", which is the vacuous pass the whole file is
// organised against.
export const HOT_ROUTE_ENTRIES = [
  'app/(main)/feed/page.tsx',
  'app/(main)/events/page.tsx',
  'app/(main)/circles/page.tsx',
  'app/(main)/messages/page.tsx',
]

/** The named heavy libraries. A prefix match, so `@tiptap/react` also catches `@tiptap/react/menus`.
 *
 *  ⚠️ EVERY ROW MUST BE A REAL DEPENDENCY of this repo. A row naming a package that is not installed
 *  can never fire, and a list of rows that can never fire reads as coverage (ADR-970). Verified
 *  against package.json on 2026-08-25: react-markdown ^10.1.0, maplibre-gl ^6.5.0, @tiptap/* ^3.30.2.
 *  The list may GROW; a row leaves only when the dependency does. */
export const HEAVY_CLIENT_MODULES = [
  // ~35-45 KB gz with the remark pipeline behind it — the number components/feed/post-replies.tsx
  // cites as its reason for mounting PostBody through `dynamic()`. This is SCAN-302's library.
  'react-markdown',
  // The map engine. Hundreds of KB, and the reason components/maps/ is a seam at all (ADR-901).
  'maplibre-gl',
  // The rich-text editor. Only ever wanted on an editing surface, never on a reading one.
  '@tiptap/react',
  '@tiptap/starter-kit',
  '@tiptap/pm',
  '@tiptap/extension-link',
  '@tiptap/extension-placeholder',
]

/** THE DETECTOR CONTROLS. Real files, not fixtures: each is a `'use client'` module that really does
 *  statically import a heavy library today, so the classifier must report it. If a control stops
 *  firing, the detector is broken (or the file was fixed) and EVERY "no heavy module on this route"
 *  verdict above it is "I never looked" rather than "I looked and it was clean".
 *
 *  🔴 IF ONE BREAKS BECAUSE SOMEONE FIXED THE FILE, THAT IS GOOD NEWS AND THE FIX IS TO REPOINT THE
 *  ROW, never to delete the control. `app/(main)/nearby/[id]/dispatch-body.tsx` is a live instance
 *  of the very class this arm exists to catch, sitting on a route HOT_ROUTE_ENTRIES does not name;
 *  it is used as a control precisely because it is real. */
export const ROUTE_HEAVY_CONTROLS = [
  { file: 'app/(main)/nearby/[id]/dispatch-body.tsx', heavy: 'react-markdown' },
  { file: 'components/maps/maplibre-canvas.tsx', heavy: 'maplibre-gl' },
]

/** THE WALK CONTROL. The four entries reached 668 client-side modules on 2026-08-25 (366/30/178/94).
 *  A floor well under that catches the failure where the resolver breaks and the walk quietly visits
 *  the entry file and nothing else — at which point "0 leaks" means "0 files examined". */
export const CLIENT_GRAPH_FLOOR = 150

const MODULE_EXTS = ['.tsx', '.ts', '.jsx', '.js', '.mjs']

/** Static module edges: `import ... from 'x'`, bare `import 'x'`, and `export ... from 'x'`.
 *
 *  Re-exports are edges too — a barrel that `export * from './heavy-thing'` pulls the body just as
 *  hard as an import does, and leaving them out is how a graph walk gets talked past by an index.ts.
 *  `import type` / `{ type A }` are erased by the compiler and are not runtime edges. `import()` and
 *  `dynamic(() => import(...))` are NOT matched, which is the point: those are the split.
 *
 *  Pure and exported so the CI half can run it on the real files. */
export function staticModuleEdges(source) {
  const out = []
  const re = /(?:^|\n)\s*(?:import|export)\s+(?!type[\s{])(?:([^'"();]*?)\s*from\s*)?['"]([^'"]+)['"]/g
  let m
  while ((m = re.exec(source))) {
    const clause = (m[1] ?? '').trim()
    const braces = /\{([^}]*)\}/.exec(clause)
    if (braces && !clause.slice(0, braces.index).replace(/,\s*$/, '').trim()) {
      const names = braces[1].split(',').map((x) => x.trim()).filter(Boolean)
      if (names.length > 0 && names.every((n) => /^type\s/.test(n))) continue
    }
    out.push(m[2])
  }
  return out
}

/** Does this source open a client boundary? The directive must be the first STATEMENT, but license
 *  headers and the repo's long comment banners legally precede it, so leading comments are skipped
 *  rather than assumed absent — reading only line 1 would classify half this codebase as server. */
export function declaresUseClient(source) {
  let rest = source.replace(/^﻿/, '')
  for (;;) {
    const trimmed = rest.replace(/^\s+/, '')
    if (trimmed.startsWith('//')) { rest = trimmed.slice(trimmed.indexOf('\n') + 1); continue }
    if (trimmed.startsWith('/*')) {
      const end = trimmed.indexOf('*/')
      if (end === -1) return false
      rest = trimmed.slice(end + 2)
      continue
    }
    return /^['"]use client['"]/.test(trimmed)
  }
}

/** The heavy modules a single source statically pulls, by name (prefix match on the package). */
export function heavyModulesIn(source, heavy = HEAVY_CLIENT_MODULES) {
  const hit = new Set()
  for (const spec of staticModuleEdges(source)) {
    const h = heavy.find((x) => spec === x || spec.startsWith(x + '/'))
    if (h) hit.add(h)
  }
  return [...hit]
}

/** Walk one route's static graph from `entryRel`, marking everything below the first `'use client'`
 *  as client code, and report the heavy modules statically imported inside that subtree.
 *
 *  Returns `{ clientFiles, leaks }`. A file is visited once per boundary state, because the same
 *  module can legitimately be reached both server-side and client-side and only the client visit is
 *  a leak. Only `@/` and relative specifiers are followed: tsconfig declares exactly one alias
 *  (`@/*` -> `./*`, verified 2026-08-25), so nothing else resolves to a file in this repo.
 *
 *  Pure apart from reads, and exported for the CI half. */
export function walkRouteClientGraph(rootDir, entryRel, heavy = HEAVY_CLIENT_MODULES) {
  const resolveLocal = (spec, fromFile) => {
    let base
    if (spec.startsWith('@/')) base = path.join(rootDir, spec.slice(2))
    else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec)
    else return null
    // One stat, not exists-then-stat. `throwIfNoEntry: false` returns undefined for a
    // missing path, so each of these is a single question to the filesystem rather than
    // two whose answers could disagree (ADR-1185). This is a resolver, not a tree walk —
    // there is no readdir here to carry the entry type, so withFileTypes does not apply.
    for (const e of MODULE_EXTS) {
      const p = base + e
      if (statSync(p, { throwIfNoEntry: false })?.isFile()) return p
    }
    const baseStat = statSync(base, { throwIfNoEntry: false })
    if (baseStat?.isDirectory()) {
      for (const e of MODULE_EXTS) {
        const p = path.join(base, 'index' + e)
        if (existsSync(p)) return p
      }
    }
    if (baseStat?.isFile()) return base
    return null
  }

  const clientFiles = new Set()
  const leaks = []
  const seen = new Set()
  const queue = [[path.join(rootDir, entryRel), false, [entryRel]]]
  while (queue.length > 0) {
    const [file, inClient, chain] = queue.shift()
    const key = `${file}|${inClient}`
    if (seen.has(key)) continue
    seen.add(key)
    let source
    try {
      source = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const client = inClient || declaresUseClient(source)
    const rel = path.relative(rootDir, file)
    if (client) clientFiles.add(rel)
    for (const spec of staticModuleEdges(source)) {
      if (spec.startsWith('@/') || spec.startsWith('.')) {
        const target = resolveLocal(spec, file)
        if (target && !target.includes(`${path.sep}node_modules${path.sep}`)) {
          queue.push([target, client, [...chain, path.relative(rootDir, target)]])
        }
      } else if (client) {
        const h = heavy.find((x) => spec === x || spec.startsWith(x + '/'))
        if (h) leaks.push({ heavy: h, file: rel, chain })
      }
    }
  }
  return { clientFiles, leaks }
}

// ─────────────────────────────────────────────────────────────────────────────
const fail = (msg) => {
  console.error(`\n🔴 check:shell-weight — ${msg}\n`)
  bail(1)
}

// 🔴 ARM C HAS NO RUNNER IN THIS FILE, ON PURPOSE — its enforcement lives in
// scripts/check-shell-weight.test.ts, and that is a PROMOTION rather than a demotion.
//
// It was briefly wired here, ahead of `main()`'s missing-`.next` return. Two things were wrong with
// that, and the second is the one that decided it:
//   1. TIMING. `main()` only ever runs in `postbuild`, i.e. on Vercel, i.e. AFTER the merge that
//      introduced the regression. Arm C needs no artifact, so paying artifact-gate latency for a
//      filesystem read meant catching the class one merge later than possible.
//   2. IT BROKE THE ARTIFACT ARMS' OWN PROOF. Arms A/B are proven by MUTATION: their tests copy this
//      script into a temp dir and run it against a SYNTHETIC `.next` in a cwd that is deliberately
//      not this repo (scripts/check-shell-weight-chunk-root.test.ts,
//      scripts/check-shell-weight-warn-only.test.ts). Arm C resolves its controls and hot routes
//      against `ROOT`, so in those fixtures it failed on "control does not exist" and swallowed the
//      arm the fixture existed to exercise. Teaching Arm C to skip when the source tree is absent
//      would have fixed the symptom by giving it a way to pass without looking — the vacuous pass
//      this whole file is organised against (ADR-970).
// So it runs in the CI half instead, where the cwd is ALWAYS the repo root, on every PR, with both
// of its controls asserted. `pnpm test` is the honest home for a filesystem-only arm.

function main() {
if (!existsSync(NEXT_DIR)) {
  console.log('check:shell-weight — no .next/ directory; Arms A and B need one, so they are skipped.')
  process.exit(0)
}

// ── Resolve the shell's eager chunk set from the real manifests ──────────────────────────────
const manifests = globSync('server/app/**/*_client-reference-manifest.js', { cwd: NEXT_DIR })
if (manifests.length === 0) {
  fail(
    'found no client-reference manifests under .next/server/app.\n' +
      '   Either the build did not get far enough to emit them, or Next changed where they live.\n' +
      '   This guard reports nothing rather than passing on an empty measurement.',
  )
}

const require_ = createRequire(import.meta.url)
globalThis.self = globalThis // the manifests assign to `self`; give them one outside a browser
const shellChunks = new Set()
let manifestsRead = 0
for (const rel of manifests) {
  try {
    require_(path.join(NEXT_DIR, rel))
  } catch {
    continue
  }
  manifestsRead += 1
  for (const entry of Object.values(globalThis.__RSC_MANIFEST ?? {})) {
    for (const f of entry?.entryJSFiles?.[SHELL_ENTRY] ?? []) shellChunks.add(f)
  }
}

if (shellChunks.size === 0) {
  fail(
    `read ${manifestsRead} manifests and found no eager JS for "${SHELL_ENTRY}".\n` +
      '   Either the shell layout was renamed/moved (update SHELL_ENTRY in this file) or the\n' +
      '   manifest shape changed. A guard that measures an empty set is not a passing guard.',
  )
}

const chunkPaths = [...shellChunks].map((f) => path.join(NEXT_DIR, f))
const missing = chunkPaths.filter((p) => !existsSync(p))
if (missing.length > 0) {
  fail(
    `${missing.length} of ${chunkPaths.length} shell chunks named by the manifest are not on disk.\n` +
      `   First: ${path.relative(ROOT, missing[0])}`,
  )
}

const shellBytes = chunkPaths.reduce((s, p) => s + statSync(p).size, 0)
const shellSource = chunkPaths.map((p) => readFileSync(p, 'utf8')).join('\n')

// ── The non-vacuity arm: every needle must be a needle ───────────────────────────────────────
// Checked BEFORE the assertions below, because each of these failing silently would turn this whole
// guard into a green light that measures nothing.
if (!shellSource.includes(CONTROL.text)) {
  fail(
    `the positive control ${JSON.stringify(CONTROL.text)} is NOT in the shell's eager chunks.\n` +
      `   ${CONTROL.source} is shell chrome and is always eager, so its absence means this guard is\n` +
      '   reading the wrong files — every "absent" verdict it could report would be vacuous.\n' +
      '   Fix the control (or SHELL_ENTRY) before trusting anything else this script says.',
  )
}

// ── THE BUILD-WIDE SCAN SET, AND THE CONTROL IT WAS MISSING ─────────────────────────────────
// 🔴 THIS LINE USED TO READ `globSync('static/chunks/**/*.js')`, AND ON VERCEL IT MATCHED NOTHING.
// Vercel's deployment adapter sets `supportsImmutableAssets` (see next/dist/server/config-shared.d.ts
// and `finalizeConfig` in next/dist/server/config.js), which relocates client chunks from
// `static/chunks/` to `static/immutable/chunks/`. A LOCAL `next build` does not set that flag, so
// the old glob worked locally and returned an EMPTY ARRAY on every Vercel build.
//
// The consequence was not a wrong number, it was a silent one: `findableInBuild` was false for every
// fingerprint, so the gate bailed on whichever row it checked first and blamed that row's LITERAL.
// The literal was fine. Arm B — the arm with teeth — had no way to be true. Confirmed against the
// live artifact of dpl_6FfMfAv7mHXQ3P2X3GmTxSCwDvEz: all 24 asset references in the served HTML are
// under /_next/static/immutable/chunks/, none under /_next/static/chunks/ (LIVE-035, 2026-08-19).
//
// So the root is DERIVED, not hardcoded: `shellChunks` came from the real client-reference manifests
// and every path in it was just `existsSync`-validated above, which makes their directory the one
// place we know the build actually wrote client chunks to.
const chunkRoots = new Set([...shellChunks].map((f) => path.posix.dirname(f)))
const allChunks = [
  ...new Set([...chunkRoots].flatMap((root) => globSync(`${root}/**/*.js`, { cwd: NEXT_DIR }))),
].map((f) => path.join(NEXT_DIR, f))

// ⚠️ DO NOT WIDEN THIS TO `.next/**`. The SSR copies under `.next/server/chunks/ssr/` carry the same
// literals, so a scan that includes them would make every fingerprint findable forever — the same
// vacuous pass this block exists to end, arrived at from the opposite direction.

// THE CONTROL THIS GATE DID NOT HAVE. There was a positive control for the SHELL set (`CONTROL`
// below/above) and none for the BUILD-WIDE set, and the build-wide set was the one built from a
// hardcoded path. Every chunk the manifest names must be inside the set we are about to grep; if it
// is not, the scan root moved and every "appears in NO built chunk" verdict is about the SCAN rather
// than the literal. Fail naming the cause, which is exactly what the old code could not do.
const scannedSet = new Set(allChunks)
const unscanned = chunkPaths.filter((p) => !scannedSet.has(p))
if (unscanned.length > 0) {
  fail(
    `the build-wide chunk scan (${allChunks.length} file(s) under ${[...chunkRoots].join(', ') || '<no root>'}) ` +
      `does not contain ${unscanned.length} of the ${chunkPaths.length} chunk(s) the manifest names.\n` +
      `   First missing: ${path.relative(NEXT_DIR, unscanned[0])}\n` +
      '   The chunk directory moved. Vercel sets supportsImmutableAssets, which relocates client\n' +
      '   chunks to static/immutable/chunks; a local build does not. Fix the scan before trusting\n' +
      '   any fingerprint verdict below — they are all about the scan while this is true.',
  )
}

// Say where it looked, on every run. The whole defect above was invisible because nothing printed
// the root, so a vacuous scan and a clean one read identically.
console.log(
  `   scanning ${allChunks.length} built chunk(s) under ${[...chunkRoots].join(', ')}; ` +
    `shell set = ${chunkPaths.length} chunk(s).`,
)

// One read of each chunk, not one per needle: this used to re-read every chunk once per fingerprint.
const buildText = allChunks.map((p) => readFileSync(p, 'utf8')).join('\n')
const findableInBuild = (needle) => buildText.includes(needle)

for (const fp of FINGERPRINTS) {
  const src = path.join(ROOT, fp.source)
  if (!existsSync(src)) {
    fail(
      `fingerprint source ${fp.source} no longer exists.\n` +
        '   Delete the row if the module is gone; repoint it if the file moved. A fingerprint that\n' +
        '   cannot be traced to a source file proves nothing about the build.',
    )
  }
  if (!readFileSync(src, 'utf8').includes(fp.text)) {
    fail(
      `fingerprint ${JSON.stringify(fp.text)} is no longer in ${fp.source}.\n` +
        '   A copy edit has blinded this guard: it would now report "absent from the shell" for a\n' +
        '   string that is absent from EVERYTHING. Pick a new literal from the same file.',
    )
  }
  if (!findableInBuild(fp.text)) {
    fail(
      `fingerprint ${JSON.stringify(fp.text)} is in ${fp.source} but appears in NO built chunk.\n` +
        '   The literal did not survive the build (minified, folded, or the module is unreachable),\n' +
        '   so "not in the shell chunks" would be true no matter what the shell contained.\n' +
        '   Pick a literal that survives — plain JSX text works.',
    )
  }
}

// ── ARM B · the assertion ────────────────────────────────────────────────────────────────────
const leaked = FINGERPRINTS.filter((fp) => shellSource.includes(fp.text))
if (leaked.length > 0) {
  console.error(
    `\n🔴 check:shell-weight — ${leaked.length} admin module ${leaked.length === 1 ? 'body is' : 'bodies are'} ` +
      `in the shell's EAGER first-load JS.\n\n` +
      '   These are operator-only surfaces. Every MEMBER, on every route under app/(main), now\n' +
      '   downloads and parses them to render nothing — the exact regression dc47b89 fixed, which\n' +
      '   cost 1.6 MB and ~1.3s of FCP. The cause is almost always a `dynamic()` that was "tidied"\n' +
      '   back into a static import, in settings-panel.tsx or module-map.tsx.\n\n' +
      '   Found in the shell chunks:\n',
  )
  for (const fp of leaked) console.error(`     ${fp.source}  (matched ${JSON.stringify(fp.text)})`)
  console.error(
    '\n   Fix: mount it with `next/dynamic`, the way its neighbours are. Do NOT delete the\n' +
      '   fingerprint row — that is how the previous version of this problem stayed invisible.\n',
  )
  bail(1)
}

// ── ARM A · the assertion ────────────────────────────────────────────────────────────────────
const kb = (b) => (b / 1024).toFixed(0)
if (shellBytes > BUDGET_KB * 1024) {
  const worst = chunkPaths
    .map((p) => [path.relative(NEXT_DIR, p), statSync(p).size])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
  console.error(
    `\n🔴 check:shell-weight — the app shell's eager first-load JS is ${kb(shellBytes)} KB across ` +
      `${chunkPaths.length} chunks, over the ${BUDGET_KB} KB budget.\n\n` +
      '   This is bytes every member parses on every route under app/(main) before the page\n' +
      '   responds to a click. Raising the budget is not the first move: find what became\n' +
      '   statically reachable from app-shell.tsx and put it behind `next/dynamic`.\n\n' +
      '   Biggest chunks:\n',
  )
  for (const [f, size] of worst) console.error(`     ${kb(size).padStart(6)} KB  ${f}`)
  console.error('')
  bail(1)
}

console.log(
  `✅ check:shell-weight — the shell's eager first-load JS is ${kb(shellBytes)} KB across ` +
    `${chunkPaths.length} chunks, under the ${BUDGET_KB} KB budget.`,
)
console.log(
  `   ${FINGERPRINTS.length} admin module bodies checked, all lazy; ` +
    `read ${manifestsRead} client-reference manifests; positive control present.`,
)
}

// Run the CLI only when invoked directly. The sibling test imports this module for its exported
// constants and the pure `staticAdminImports` classifier, and must not trip the artifact arms.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
