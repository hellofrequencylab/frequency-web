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
