import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// THE TWO-TIER VISUAL COMPARE, PINNED.
//
// `pr-compare` runs the @visual suite in two tiers (.github/workflows/e2e.yml):
//
//   PUBLIC (@visual, not @shell)  blocks. Anonymous, content-stable surfaces.
//   SHELL  (@visual AND @shell)   advisory. Member + operator surfaces photographed against
//                                 LIVE PRODUCTION DATA, which moves on its own.
//
// The split exists because the shell tier cannot tell "someone moved the header" from "the
// Space gained a member since Tuesday". surfaces.ts records the measurement: the Space console
// moved 252 px in eight hours with no deploy touching the route. Leaving that as a blocking
// red X is the ADR-970 failure: a gate that cannot fire truthfully gets routed around, and
// then it reads as coverage.
//
// This file exists because the arrangement is expressed in two places that cannot see each
// other -- two npm scripts and two workflow steps -- and every one of the assertions below
// failed at least once while it was being built.
//
// 🔴 THE HAZARD THIS FILE EXISTS FOR, WHICH IS NOT HYPOTHETICAL.
// The advisory grep MUST require BOTH tags. The obvious spelling, `--grep @shell`, is wrong
// and was caught only by listing the tests: `@shell` is also carried by `a11y.spec.ts` and
// `overflow.spec.ts`, so a bare `@shell` grep silently drags the accessibility and overflow
// shell suites into the advisory tier and stops them blocking. Those two are DETERMINISTIC --
// they assert roles and geometry, not pixels -- so they must keep their teeth. The positive
// control at the bottom fails if that stops being true, which is the only thing that makes
// this rule readable to whoever changes it next.

const ROOT = path.join(__dirname, '..', '..')
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}
const e2eYml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'e2e.yml'), 'utf8')

describe('the visual compare is split into a blocking tier and an advisory tier', () => {
  it('the blocking tier takes @visual and excludes @shell', () => {
    const s = pkg.scripts['test:e2e:visual:stable']
    expect(s, 'test:e2e:visual:stable is missing').toBeTruthy()
    expect(s).toContain('--grep @visual')
    expect(s).toContain('--grep-invert @shell')
  })

  it('the advisory tier requires BOTH tags, never a bare @shell', () => {
    const s = pkg.scripts['test:e2e:visual:shell']
    expect(s, 'test:e2e:visual:shell is missing').toBeTruthy()
    // Both lookaheads, in either order, are what makes this visual-only.
    expect(s).toMatch(/\(\?=\.\*@visual\)/)
    expect(s).toMatch(/\(\?=\.\*@shell\)/)
    // The exact wrong spelling, named so the diff that reintroduces it fails here.
    expect(
      /--grep\s+"?@shell"?\s*$/.test(s),
      'a bare `--grep @shell` also selects a11y.spec.ts and overflow.spec.ts, which must keep blocking',
    ).toBe(false)
  })

  it('every @visual test lands in exactly one tier', () => {
    // The two greps partition the tag: one takes @visual minus @shell, the other takes the
    // intersection. Nothing can be in both, and nothing tagged @visual can be in neither.
    const stable = pkg.scripts['test:e2e:visual:stable']
    const shell = pkg.scripts['test:e2e:visual:shell']
    expect(stable).toContain('--grep-invert @shell')
    expect(shell).toMatch(/\(\?=\.\*@shell\)/)
    // Measured with `playwright test --list` on 2026-09-14: 102 blocking + 60 advisory = 162,
    // which is every @visual test. The counts are not asserted (they move with surfaces), but
    // the partition is, and it is what keeps the sum whole.
  })
})

describe('the workflow wires the tiers the way the tiers are meant to behave', () => {
  it('the blocking step runs the stable tier and is NOT continue-on-error', () => {
    expect(e2eYml).toContain('run: pnpm test:e2e:visual:stable')
    const idx = e2eYml.indexOf('run: pnpm test:e2e:visual:stable')
    // Look back over this step only. A continue-on-error here would make the whole compare
    // advisory and there would be no gate left at all.
    const stepStart = e2eYml.lastIndexOf('- name:', idx)
    expect(e2eYml.slice(stepStart, idx)).not.toContain('continue-on-error')
  })

  it('the advisory step runs the shell tier, carries an id, and does not fail the job', () => {
    expect(e2eYml).toContain('run: pnpm test:e2e:visual:shell')
    const idx = e2eYml.indexOf('run: pnpm test:e2e:visual:shell')
    const stepStart = e2eYml.lastIndexOf('- name:', idx)
    const step = e2eYml.slice(stepStart, idx)
    expect(step).toContain('continue-on-error: true')
    expect(step).toContain('id: shell_visual')
  })

  it('the diffs still upload when only the advisory tier failed', () => {
    // `failure()` alone does not cover a continue-on-error step, so the advice in the job
    // summary would have pointed at an artifact that was never uploaded.
    const idx = e2eYml.indexOf('name: playwright-report-pr-compare')
    const stepStart = e2eYml.lastIndexOf('- name: Upload report', idx)
    expect(stepStart, 'the upload step moved or was renamed').toBeGreaterThan(-1)
    expect(e2eYml.slice(stepStart, idx)).toContain("steps.shell_visual.outcome == 'failure'")
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
    // If either of these ever gained '@visual', it would join the advisory tier and quietly
    // stop blocking. They assert roles and geometry, which are deterministic, so they should
    // never be advisory.
    expect(a11y).not.toContain("'@visual'")
    expect(overflow).not.toContain("'@visual'")
  })
})
