import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// THE THREE-TIER VISUAL COMPARE, PINNED.
//
// `pr-compare` runs the @visual suite in three steps (.github/workflows/e2e.yml):
//
//   PUBLIC (@visual, not @shell, not @advisory)  blocks. Anonymous, content-stable surfaces.
//   SHELL   (@visual AND @shell, not @advisory)  blocks (LIVE-313 / ADR-1449). Member +
//                                               operator. viewportOnly + data-visual-mask
//                                               hold the chrome; six PRs on 2026-09-19 ran
//                                               this step green while the public tier was red.
//   ADVISORY (@visual AND @advisory)             does not block. /discover (LIVE-373): live
//                                               Circles / events / posts set the height. It is
//                                               still CAPTURED every run. Advisory is not
//                                               skipped. Three operator surfaces rode this tier
//                                               2026-09-23 to 2026-09-28 (LIVE-476, LIVE-492,
//                                               LIVE-504); all three block again.
//
// This file exists because the arrangement is expressed in three places that cannot see each
// other -- three npm scripts and three workflow steps -- and every one of the assertions below
// failed at least once while it was being built.
//
// 🔴 THE HAZARD THIS FILE EXISTS FOR, WHICH IS NOT HYPOTHETICAL.
// The shell grep MUST require BOTH @visual AND @shell. The obvious spelling, `--grep @shell`,
// is wrong and was caught only by listing the tests: `@shell` is also carried by `a11y.spec.ts`
// and `overflow.spec.ts`, so a bare `@shell` grep silently drags the accessibility and overflow
// shell suites into the visual job. Those two are DETERMINISTIC -- they assert roles and
// geometry, not pixels -- and they already run in the smoke+a11y step. The positive control
// at the bottom fails if that stops being true.

const ROOT = path.join(__dirname, '..', '..')
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}
const e2eYml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'e2e.yml'), 'utf8')

function stepAround(needle: string): string {
  const idx = e2eYml.indexOf(needle)
  expect(idx, `${needle} is gone from e2e.yml`).toBeGreaterThan(-1)
  const stepStart = e2eYml.lastIndexOf('- name:', idx)
  return e2eYml.slice(stepStart, idx)
}

describe('the visual compare is split into a blocking public, a blocking shell, and an advisory live index', () => {
  it('the blocking public tier takes @visual and excludes both live-data tags', () => {
    const s = pkg.scripts['test:e2e:visual:stable']
    expect(s, 'test:e2e:visual:stable is missing').toBeTruthy()
    expect(s).toContain('--grep @visual')
    // LIVE-373: invert BOTH @shell (member/operator) AND @advisory (/discover live index).
    // A lone invert of @shell would leave /discover blocking, which is the defect.
    expect(s).toMatch(/--grep-invert\s+"@shell\|@advisory"/)
  })

  it('the blocking shell tier requires @visual AND @shell, and inverts @advisory', () => {
    const s = pkg.scripts['test:e2e:visual:shell']
    expect(s, 'test:e2e:visual:shell is missing').toBeTruthy()
    expect(s).toMatch(/\(\?=\.\*@visual\)/)
    expect(s).toMatch(/\(\?=\.\*@shell\)/)
    expect(s).toMatch(/--grep-invert\s+@advisory/)
    expect(
      /--grep\s+"?@shell"?\s*$/.test(s),
      'a bare `--grep @shell` also selects a11y.spec.ts and overflow.spec.ts',
    ).toBe(false)
    expect(
      s.includes('@advisory') && !s.includes('grep-invert'),
      'folding @advisory back into the shell grep would make /discover block (LIVE-373)',
    ).toBe(false)
  })

  it('the advisory tier is @visual AND @advisory, never a bare @shell', () => {
    const s = pkg.scripts['test:e2e:visual:advisory']
    expect(s, 'test:e2e:visual:advisory is missing').toBeTruthy()
    expect(s).toMatch(/\(\?=\.\*@visual\)/)
    expect(s).toMatch(/\(\?=\.\*@advisory\)/)
    expect(s).not.toMatch(/@shell/)
  })
})

describe('the workflow wires the tiers the way the tiers are meant to behave', () => {
  it('the public step runs the stable tier and is NOT continue-on-error', () => {
    expect(e2eYml).toContain('run: pnpm test:e2e:visual:stable')
    expect(stepAround('run: pnpm test:e2e:visual:stable')).not.toContain('continue-on-error')
  })

  it('the shell step runs the shell tier and is NOT continue-on-error (LIVE-313)', () => {
    expect(e2eYml).toContain('run: pnpm test:e2e:visual:shell')
    expect(e2eYml).toContain('Visual compare -- member shell + operator')
    expect(stepAround('run: pnpm test:e2e:visual:shell')).not.toContain('continue-on-error')
  })

  it('the advisory step runs the live-index tier, carries an id, and does not fail the job', () => {
    expect(e2eYml).toContain('run: pnpm test:e2e:visual:advisory')
    const step = stepAround('run: pnpm test:e2e:visual:advisory')
    expect(step).toContain('continue-on-error: true')
    expect(step).toContain('id: advisory_visual')
  })

  it('the diffs still upload when only the advisory tier failed', () => {
    const idx = e2eYml.indexOf('name: playwright-report-pr-compare')
    const stepStart = e2eYml.lastIndexOf('- name: Upload report', idx)
    expect(stepStart, 'the upload step moved or was renamed').toBeGreaterThan(-1)
    expect(e2eYml.slice(stepStart, idx)).toContain("steps.advisory_visual.outcome == 'failure'")
  })

  it('the advisory tier says so in the job summary rather than failing quietly', () => {
    expect(e2eYml).toContain('this does not block')
  })

  // 🔴 A REPORT THAT NAMES ONE OF TWO SURFACES IS WORSE THAN NO REPORT, because a reader who
  // sees /discover and nothing else concludes the other capture did not run. The summary step
  // is the only place a human is shown an advisory diff, so every surface on the tier has to be
  // named there, with the row that owns it: /discover today, plus whatever the operator
  // advisory roster carries (empty once #2949 and #2955 have taken LIVE-492 and LIVE-504 out; it
  // named /admin/qr and LIVE-476 while that surface rode the tier).
  it('the advisory summary names EVERY surface on the tier, with its row', () => {
    const idx = e2eYml.indexOf('- name: Report the advisory tier')
    expect(idx, 'the advisory report step moved or was renamed').toBeGreaterThan(-1)
    const step = e2eYml.slice(idx, idx + 1600)
    for (const named of ['/discover', 'LIVE-373']) {
      expect(step, `the advisory summary does not name ${named}`).toContain(named)
    }
    for (const [path, row] of Object.entries(advisoryOperatorRoster())) {
      expect(step, `the advisory summary does not name ${path}`).toContain(path)
      expect(step, `the advisory summary does not name ${row} beside ${path}`).toContain(row)
    }
    // The one instruction that must not be missing: a recapture would bury an unexplained diff.
    expect(step).toContain('Do NOT')
  })
})

/** The operator advisory roster as the tree declares it, read from the source of surfaces.ts
 *  with comments blanked so a closed note cannot count as an entry. Each entry is a quoted path
 *  mapped to a quoted row id. */
function advisoryOperatorRoster(): Record<string, string> {
  const src = fs.readFileSync(path.join(ROOT, 'test', 'e2e', 'surfaces.ts'), 'utf8')
  const open = src.indexOf('export const ADVISORY_OPERATOR_SURFACES: Readonly<Record<string, string>> = {')
  expect(open, 'ADVISORY_OPERATOR_SURFACES is gone from surfaces.ts').toBeGreaterThan(-1)
  const close = src.indexOf('\n}', open)
  expect(close, 'ADVISORY_OPERATOR_SURFACES never closes').toBeGreaterThan(open)
  const body = src
    .slice(open, close)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  const roster: Record<string, string> = {}
  for (const m of body.matchAll(/'([^']+)':\s*'([^']+)'/g)) roster[m[1]] = m[2]
  return roster
}

describe('the positive control: @shell is genuinely shared, so the bare grep really is a trap', () => {
  it('a11y and overflow still tag shell suites, and they are not visual', () => {
    const a11y = fs.readFileSync(path.join(ROOT, 'test', 'e2e', 'a11y.spec.ts'), 'utf8')
    const overflow = fs.readFileSync(path.join(ROOT, 'test', 'e2e', 'overflow.spec.ts'), 'utf8')
    expect(a11y).toContain('@shell')
    expect(overflow).toContain('@shell')
    // If either of these ever gained '@visual', it would join a visual grep and quietly
    // stop blocking in smoke+a11y. They assert roles and geometry, so they should never
    // be visual.
    expect(a11y).not.toContain("'@visual'")
    expect(overflow).not.toContain("'@visual'")
  })

  it('LIVE-373: /discover visual captures ride the advisory tier, not a blocking loop', () => {
    const vis = fs.readFileSync(path.join(ROOT, 'test', 'e2e', 'visual.spec.ts'), 'utf8')
    const discover = vis.match(
      /test\.describe\('visual · discover',\s*\{\s*tag:\s*\[([^\]]+)\]/,
    )
    expect(discover, 'visual.spec.ts no longer has a discover describe').toBeTruthy()
    expect(discover![1]).toContain('@visual')
    expect(discover![1]).toContain('@advisory')
    expect(
      discover![1].includes('@shell'),
      '@shell would make shell-reporter.ts treat a running /discover capture as the app shell',
    ).toBe(false)
    expect(
      vis.includes("publicSurfaces().filter((s) => s.path !== '/discover')"),
      'the blocking public loop still photographs /discover, so a new listed Circle fails every PR',
    ).toBe(true)
  })

  // ── THE OPERATOR ADVISORY ROSTER AND ITS WIRING, HELD IN STEP ──────────────────────────────
  //
  // /admin/qr rode the advisory tier from 2026-09-23 to 2026-09-28 (LIVE-476), then
  // /admin/content/practices (LIVE-492) and /admin/library (LIVE-504). Each was photographed in
  // a second operator describe, tagged @visual and @advisory and never @shell, and filtered out
  // of the blocking loop by the same list, so the two loops could not drift apart. All three
  // vote again: the first two leave the roster in #2949 and #2955, and the change that retired
  // the describe and the filter merges after them, so the roster it leaves behind is empty.
  //
  // 🔴 THE HAZARD IS THE SAME IN BOTH DIRECTIONS. Advisory means photographed-and-not-voting. A
  // change that put a surface in the roster, dropped it from the blocking loop and forgot the
  // describe would silently stop photographing an operator surface, which is HYG-026 all over
  // again. And a describe left looping an EMPTY roster reads as coverage while collecting
  // nothing. So the wiring is asserted in-tree against the roster, on every pull request, and
  // the assertion says which way it failed.
  it('the operator advisory describe and the blocking-loop filter exist exactly when the roster has an entry', () => {
    const vis = fs.readFileSync(path.join(ROOT, 'test', 'e2e', 'visual.spec.ts'), 'utf8')
    const surfaces = fs.readFileSync(path.join(ROOT, 'test', 'e2e', 'surfaces.ts'), 'utf8')

    // The roster is untouched: /admin/qr is still an operator surface, so a11y, overflow and the
    // coverage ledger all still see it. Shrinking OPERATOR_PATHS would be the quiet version.
    expect(
      surfaces.includes("{ path: '/admin/qr',"),
      '/admin/qr was removed from OPERATOR_PATHS: a surface leaves the advisory tier by voting again, not by being dropped',
    ).toBe(true)

    const roster = advisoryOperatorRoster()
    const advisory = vis.match(
      /test\.describe\('visual · operator console · advisory',\s*\{\s*tag:\s*\[([^\]]+)\]/,
    )
    const filtered = vis.includes('!ADVISORY_OPERATOR_PATHS.includes(s.path)')

    if (Object.keys(roster).length === 0) {
      expect(
        advisory,
        'ADVISORY_OPERATOR_SURFACES is empty but visual.spec.ts still has an operator advisory describe: it loops nothing and reads as coverage',
      ).toBeNull()
      expect(
        filtered,
        'ADVISORY_OPERATOR_SURFACES is empty but the blocking operator loop still filters on it',
      ).toBe(false)
      expect(
        vis.includes('for (const surface of operatorSurfaces())'),
        'the blocking operator loop no longer photographs every operator surface',
      ).toBe(true)
      return
    }

    // Out of the blocking loop, by the shared list rather than by a literal, so the two loops
    // cannot drift apart.
    expect(filtered, `the roster names ${Object.keys(roster).join(', ')} but the blocking operator loop still photographs them`).toBe(true)
    expect(advisory, 'the roster has an entry and visual.spec.ts has no advisory operator describe: that surface stopped being photographed').toBeTruthy()
    expect(advisory![1]).toContain('@visual')
    expect(advisory![1]).toContain('@advisory')
    expect(
      advisory![1].includes('@shell'),
      '@shell would make shell-reporter.ts treat a running advisory capture as the operator console',
    ).toBe(false)
    const block = vis.slice(vis.indexOf("test.describe('visual · operator console · advisory'"))
    expect(
      block.includes('ADVISORY_OPERATOR_PATHS.includes(s.path)'),
      'the advisory describe does not actually loop the advisory surfaces',
    ).toBe(true)
    expect(
      block.includes('storageState: STORAGE_STATE'),
      'the advisory operator describe has no session, so every capture would bounce',
    ).toBe(true)
  })
})
