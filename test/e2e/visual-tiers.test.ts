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
//   ADVISORY (@visual AND @advisory)             does not block. /discover only (LIVE-373):
//                                               live Circles / events / posts set the height.
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
    expect(e2eYml).toContain('advisory -- this does not block')
  })
})

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
})
