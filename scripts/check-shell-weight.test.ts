import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import {
  FINGERPRINTS,
  CONTROL,
  LAZY_MOUNT_SITES,
  BUDGET_KB,
  SYNCHRONOUS_ADMIN_IMPORTS,
  staticAdminImports,
  HOT_ROUTE_ENTRIES,
  HEAVY_CLIENT_MODULES,
  ROUTE_HEAVY_CONTROLS,
  CLIENT_GRAPH_FLOOR,
  walkRouteClientGraph,
  declaresUseClient,
  heavyModulesIn,
} from './check-shell-weight.mjs'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE CI HALF OF check:shell-weight (ADR-1066 · LIVE-009).
//
// `scripts/check-shell-weight.mjs` is an ARTIFACT gate: it reads `.next` and can only run in
// `postbuild`, which means on Vercel — and on this repo `main` is protected and MERGING DEPLOYS, so
// the artifact gate's first opportunity to fire is after the merge, on the deploy. That is the right
// place for the MEASUREMENT (nothing else can compute real first-load bytes) and the wrong place for
// the only enforcement.
//
// So this file is the PR-time half, and it follows scripts/build-fanout.test.ts exactly: the SOURCE
// half runs everywhere and catches the CHANGE that causes the regression; the TRACE half only runs
// where a build exists and is the only half that MEASURES. Neither is redundant — the source half
// cannot see a bundler change that voids the split, and the trace half cannot run on a PR.
//
// It also keeps the artifact gate's own needles honest at PR time: a copy edit that removes a
// fingerprint from its source file blinds the deploy gate silently, and that failure would be
// invisible until the next regression walked past it. Here it is a red test on the PR that made it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const ROOT = path.join(import.meta.dirname, '..')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

type Fingerprint = { text: string; source: string }
const fingerprints = FINGERPRINTS as Fingerprint[]
const sites = LAZY_MOUNT_SITES as string[]
const allowed = new Set(SYNCHRONOUS_ADMIN_IMPORTS as string[])

describe('the guard is looking at something', () => {
  it('carries a real fingerprint set and a real mount-site set', () => {
    // The non-triviality control. An empty FINGERPRINTS array would make every `it.each` below
    // iterate zero times and report success — "I never looked" dressed as "I looked and it was
    // fine". Lower these floors only alongside a module genuinely ceasing to exist.
    expect(fingerprints.length).toBeGreaterThanOrEqual(8)
    expect(sites.length).toBeGreaterThanOrEqual(2)
    expect(BUDGET_KB).toBeGreaterThan(0)
  })
})

describe('the shell mounts every admin body lazily', () => {
  it.each(sites)('%s has no static import of a components/admin module', (site) => {
    expect(existsSync(path.join(ROOT, site)), `${site} does not exist — repoint LAZY_MOUNT_SITES.`).toBe(true)
    const src = read(site)

    // Non-triviality, per file: this file must actually be USING next/dynamic. Without it, a file
    // that had been emptied — or one whose imports moved to a helper — would pass this test by
    // having nothing to find, which is the exact vacuous pass the assertion below exists to prevent.
    expect(
      /from 'next\/dynamic'/.test(src),
      `${site} does not import next/dynamic, so "no static admin imports" proves nothing about it.`,
    ).toBe(true)

    expect(
      staticAdminImports(src).filter((spec: string) => !allowed.has(spec)),
      `${site} statically imports an admin module.\n\n` +
        `  This file is on the shell's static path: app/(main)/layout.tsx -> app-shell.tsx ->\n` +
        `  AdminBar -> settings-panel.tsx, with no code-split boundary. A static import here is\n` +
        `  eager first-load JS for every MEMBER on every route under app/(main), rendering nothing\n` +
        `  — the regression dc47b89 fixed at a cost of 1.6 MB and ~1.3s of FCP (ADR-1066).\n\n` +
        `  Fix: const X = dynamic(() => import('...').then((m) => m.X))\n` +
        `  The three exceptions are things the rail consults SYNCHRONOUSLY, listed with their\n` +
        `  measured cost in SYNCHRONOUS_ADMIN_IMPORTS. That list shrinks; it does not grow.\n`,
    ).toEqual([])
  })

  it('every declared exception is actually still imported, so the allowlist cannot rot', () => {
    // A ratchet that keeps entries for imports nobody makes any more stops being a ratchet and
    // becomes a licence: the next author reads three allowed specifiers and assumes a fourth is
    // fine. Same rule scripts/check-menu.mjs applies to FROZEN_MENU_DEBT (a stale entry fails).
    const imported = new Set(sites.flatMap((s) => staticAdminImports(read(s)) as string[]))
    for (const spec of allowed) {
      expect(
        imported.has(spec),
        `${spec} is in SYNCHRONOUS_ADMIN_IMPORTS but nothing imports it any more. Remove the entry.`,
      ).toBe(true)
    }
  })

  it('the classifier it uses can actually find a static admin import', () => {
    // Guards the guard. `staticAdminImports` returning [] is the PASS condition above, so a broken
    // regex would make every assertion in this file green forever. Drive it with the shape that
    // must fail, and with the two shapes that must NOT.
    expect(
      staticAdminImports("import { EventDangerZone } from '@/components/admin/modules/event-danger-zone'"),
    ).toEqual(['@/components/admin/modules/event-danger-zone'])
    // `import type` is erased by the compiler — not a runtime edge, so not a violation.
    expect(staticAdminImports("import type { X } from '@/components/admin/modules/x'")).toEqual([])
    expect(staticAdminImports("import { type X, type Y } from '@/components/admin/modules/x'")).toEqual([])
    // A dynamic import is the fix, and must not read as the violation.
    expect(
      staticAdminImports("const X = dynamic(() => import('@/components/admin/modules/x').then((m) => m.X))"),
    ).toEqual([])
  })
})

describe("the artifact gate's needles are still needles", () => {
  it.each(fingerprints.map((f) => [f.source, f.text] as const))(
    '%s still contains its fingerprint',
    (source, text) => {
      expect(existsSync(path.join(ROOT, source)), `${source} does not exist — update FINGERPRINTS.`).toBe(true)
      expect(
        read(source).includes(text),
        `The fingerprint ${JSON.stringify(text)} is no longer in ${source}.\n` +
          `  check:shell-weight would now report it "absent from the shell's eager chunks" for a\n` +
          `  string that is absent from EVERYTHING — a silently vacuous deploy gate. Pick a new\n` +
          `  literal from the same file rather than deleting the row.`,
      ).toBe(true)
    },
  )

  it('the positive control is still in the file it claims', () => {
    expect(existsSync(path.join(ROOT, CONTROL.source))).toBe(true)
    expect(read(CONTROL.source).includes(CONTROL.text)).toBe(true)
  })

  it('every fingerprint names a distinct module, so one copy edit cannot blind the whole gate', () => {
    expect(new Set(fingerprints.map((f) => f.source)).size).toBe(fingerprints.length)
  })
})

describe('the artifact gate is wired where it can run', () => {
  it('is in postbuild BLOCKING (promoted 2026-08-19), and nowhere else (LIVE-035)', () => {
    // ── THIS TEST CHANGED ON 2026-08-19, AND THE OLD VERSION WAS RIGHT TO FAIL ────────────────
    // It used to assert the gate was NOT in postbuild at all, because a build-blocking gate that has
    // never seen a real artifact is this repo's own 2026-08-11 outage with the roles reversed. That
    // reasoning is unchanged and still correct. What changed is that "blocking" and "in postbuild"
    // stopped being the same thing.
    //
    // The gate now runs in postbuild as `--warn-only`: it measures, prints, and cannot exit non-zero
    // on any arm, on a missing manifest, or on its own crash. That is what breaks the deadlock this
    // row sat in — its one lifetime reading is unconfirmed in BOTH directions, and the only thing
    // that can confirm it is a real artifact, which it could only reach by being wired.
    //
    // PROMOTED 2026-08-19, owner verbatim: "promote it." The condition the paragraph above set was
    // met the honest way: the gate printed green on TWO PRODUCTION artifacts (17:14Z and 18:13Z,
    // both 1010 KB of the 1400 KB budget across 21 chunks, all 8 admin module bodies lazy, positive
    // control present). So the assertion inverts again: it must be present, and it must NOT carry
    // the flag — re-adding `--warn-only` would silently demote an owner-promoted gate, which is the
    // fail-safe-that-fired-and-nobody-noticed shape rule 6 exists for. Its sibling
    // check-cache-budget deliberately KEEPS the flag: its action is a trim and it has killed two
    // builds; that promotion is a separate decision (LIVE-035 carries it).
    const pkg = JSON.parse(read('package.json'))
    const postbuild = String(pkg.scripts.postbuild ?? '')
    expect(postbuild).toContain('scripts/check-shell-weight.mjs')
    const shellArgs = /check-shell-weight\.mjs([^&|;]*)/.exec(postbuild)?.[1] ?? ''
    expect(
      /--warn-only/.test(shellArgs),
      'check-shell-weight.mjs runs in postbuild with --warn-only, but the owner promoted it on ' +
        '2026-08-19 after two green production readings. Warn-only now means a silent demotion.',
    ).toBe(false)
    // Still exactly one home. It reads `.next`, and CI never builds (DEPLOY-SAFETY.md, ADR-1003),
    // so a copy in the CI guards array would be a guard that silently measures nothing.
    expect(read('.github/workflows/ci.yml')).not.toContain('check:shell-weight')
    // And the UNWIRED declaration must be GONE, so the two files cannot disagree about its state.
    expect(
      read('scripts/guard-wiring.test.ts').includes("'check:shell-weight':"),
      'wired now, but guard-wiring.test.ts still declares it UNWIRED — remove that entry',
    ).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ARM C · THE ROUTE CHUNK (SCAN-506).
//
// Arms A and B watch ONE manifest entry, the shell layout. A heavy library pulled in by a ROUTE's
// own client component is invisible to both: it never enters the shell entry, it lands in that
// route's chunk, and every member who opens that route pays for it. SCAN-302 found react-markdown
// on the feed path by hand, which is how this arm came to exist.
//
// WHY IT LIVES HERE AND NOT IN THE .mjs. Arm C is filesystem-only, so `postbuild` — which runs on
// Vercel, after the merge — is the latest possible place to fire it and the least useful. It also
// cannot coexist with the artifact arms' mutation fixtures, which run the script from a cwd that is
// deliberately not this repo (check-shell-weight-chunk-root.test.ts, check-shell-weight-warn-only
// .test.ts); there, Arm C's controls do not exist and it failed over that instead of exercising the
// arm under test. Here the cwd is always the repo root and it runs on every PR. Same rule, earlier.
//
// WHAT IT PROVES, AND WHAT IT DOES NOT. A static import below a `use client` boundary is not
// code-split by any bundler setting, so "statically imported inside this route's client subtree" IS
// "in this route's first-load JS" — provable without a build. It is a FINGERPRINT arm, the
// route-level twin of Arm B, never a budget: an unnamed heavy dependency is not caught, and there
// is no route byte ceiling, because an honest one needs the artifact. `dynamic()` and bare
// `import()` are not static edges and are correctly invisible to it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const heavy = HEAVY_CLIENT_MODULES as string[]
const hotRoutes = HOT_ROUTE_ENTRIES as string[]
const routeControls = ROUTE_HEAVY_CONTROLS as { file: string; heavy: string }[]

describe('Arm C · the detector can see a heavy import at all', () => {
  it('names real heavy packages, every one a real dependency', () => {
    // A row naming a package this repo does not install can never fire, and a list of rows that
    // cannot fire reads as coverage (ADR-970). The list may GROW; a row leaves only when the
    // dependency does.
    const pkg = JSON.parse(read('package.json')) as { dependencies?: Record<string, string> }
    const deps = pkg.dependencies ?? {}
    expect(heavy.length).toBeGreaterThanOrEqual(3)
    for (const name of heavy) {
      expect(deps[name], `HEAVY_CLIENT_MODULES names ${name}, which is not a dependency`).toBeTruthy()
    }
  })

  it.each(routeControls)('$file still reports $heavy in a client module', (ctl) => {
    // 🔴 IF THIS BREAKS BECAUSE SOMEONE FIXED THE FILE, THAT IS GOOD NEWS AND THE FIX IS TO REPOINT
    // THE ROW, never to delete the control. Without it, every "no heavy module on this route"
    // verdict below is "I never looked" dressed as "I looked and it was clean".
    expect(
      existsSync(path.join(ROOT, ctl.file)),
      `${ctl.file} does not exist — repoint ROUTE_HEAVY_CONTROLS at another real instance.`,
    ).toBe(true)
    const src = read(ctl.file)
    expect(declaresUseClient(src), `${ctl.file} is no longer a client module`).toBe(true)
    expect(heavyModulesIn(src)).toContain(ctl.heavy)
  })

  it('does NOT flag a dynamic import, a type-only import, or a server component', () => {
    // The paired negative. Without it the assertions above pass for a detector that flags every
    // mention of the string, which would make Arm C unusable and then routed around.
    expect(heavyModulesIn("const M = dynamic(() => import('react-markdown'))")).toEqual([])
    expect(heavyModulesIn("import type { Options } from 'react-markdown'")).toEqual([])
    expect(declaresUseClient("// a banner\n/* and a block */\nimport x from 'y'")).toBe(false)
    // ...and the paired positive for each, so the negatives are not passing by being blind.
    expect(heavyModulesIn("import ReactMarkdown from 'react-markdown'")).toEqual(['react-markdown'])
    expect(heavyModulesIn("export { default } from 'maplibre-gl/dist/x'")).toEqual(['maplibre-gl'])
    expect(declaresUseClient("// a banner\n/* and a block */\n'use client'\nimport x from 'y'")).toBe(true)
  })
})

describe('Arm C · no heavy library reaches a member hot route as client code', () => {
  // Deliberately `page.tsx` and NOT the layout: the layout IS the shell, and Arms A/B already
  // measure it to the byte. What this adds is the delta a route contributes ON TOP of the shell.
  const walked = hotRoutes.map((entry) => ({ entry, ...walkRouteClientGraph(ROOT, entry) }))

  it('walks a real graph rather than four entry files', () => {
    // The non-triviality control. A resolver or alias change that stops the walk descending would
    // report "0 leaks" from having visited one file each. 668 client modules on 2026-08-25.
    expect(hotRoutes.length).toBeGreaterThanOrEqual(4)
    for (const entry of hotRoutes) {
      expect(existsSync(path.join(ROOT, entry)), `${entry} moved — update HOT_ROUTE_ENTRIES.`).toBe(true)
    }
    const total = walked.reduce((n, w) => n + w.clientFiles.size, 0)
    expect(total, 'the import walk is not descending; a clean verdict would be about the WALK').
      toBeGreaterThanOrEqual(CLIENT_GRAPH_FLOOR as number)
  })

  it.each(walked)('$entry ships no named heavy library in its client subtree', (w) => {
    // Fix a red here by mounting the component through `next/dynamic`, or by keeping the render on
    // the SERVER (a server component may import react-markdown freely — it ships no client bytes).
    // Do NOT remove the row from HEAVY_CLIENT_MODULES.
    const shown = w.leaks.map((l) => `${l.heavy} imported by ${l.file}\n       via: ${l.chain.slice(-4).join(' -> ')}`)
    expect(shown, `${w.entry} — a static import below a 'use client' boundary is NOT code-split`).toEqual([])
  })
})
