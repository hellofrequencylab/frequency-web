import { describe, it, expect } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// WARN-ONLY MUST NEVER BE ABLE TO FAIL A BUILD -- and postbuild must never quietly fall back to it.
//
// check:cache-budget ran its warn-only stage in postbuild under LIVE-035 and was PROMOTED to
// blocking on 2026-08-19 (owner: "implement best practice"), after a real build printed the paired
// reading that settled PACKED_PER_RAW (raw measure beside `Uploading build cache [N GB]`) and the
// trim was restricted to a named compiler-cache list (ADR-1086, LIVE-048).
//
// The `--warn-only` MODE stays in the script for local runs and any future re-staging, so its
// guarantee stays locked down here: in warn-only the script measures, prints, and exits 0 no matter
// what it finds or what goes wrong inside it. That guarantee is one `process.exit(1)` away from
// being false, and the failure would be invisible in review. It is proven by MUTATION rather than
// by reading: each case rewrites the script into a temp copy that forces the condition, then runs
// it for real.
//
// The LAST test inverted when the promotion landed: postbuild must now run the gate BARE, so a
// re-added `--warn-only` fails as a silent demotion, the same trap the shell-weight pins set.

const SCRIPT = 'scripts/check-cache-budget.mjs'
const SRC = readFileSync(SCRIPT, 'utf8')

/** Write a mutated copy of the script into a temp dir and run it from the repo root. */
function runMutant(mutate: (src: string) => string, args: string[] = []): number {
  const dir = mkdtempSync(join(tmpdir(), 'cache-budget-'))
  const file = join(dir, 'mutant.mjs')
  const mutated = mutate(SRC)
  // A MUTATION THAT NO LONGER APPLIES PASSES EVERY ASSERTION BELOW, for the wrong reason: the
  // unmutated script exits 0 in warn-only because that is exactly what it promises. So the mutators
  // are pattern replacements against a file that keeps being edited, and one of them silently became
  // a no-op on 2026-08-24 when `const nodeModules` became `let nodeModules` — the crash case stopped
  // forcing a crash and the test asserting "it says CRASHED out loud" was the only thing that caught
  // it. This makes the mutation itself the assertion rather than relying on that.
  if (mutated === SRC) throw new Error('mutation did not apply — this test would pass vacuously')
  writeFileSync(file, mutated)
  // cwd stays the repo root so the script measures the real node_modules, which is the point:
  // these assertions are about the exit code under a real measurement, not a mocked one.
  const res = spawnSync(process.execPath, [file, ...args], { cwd: process.cwd(), encoding: 'utf8' })
  return res.status ?? -1
}

/** Force the node_modules floor arm to fire by shrinking the budget below the real tree. */
const breachFloor = (src: string) =>
  src.replace(/const NODE_MODULES_BUDGET_GIB = [\d.]+/, 'const NODE_MODULES_BUDGET_GIB = 0.01')

/** Force an unhandled throw partway through, after the warn-only handler is installed. */
const forceCrash = (src: string) =>
  src.replace(
    /^let nodeModules = measure\('node_modules'\)$/m,
    "let nodeModules = (() => { throw new Error('simulated measurement failure') })()",
  )

describe('check:cache-budget warn-only cannot fail a build', () => {
  it('exits 0 when the node_modules floor is breached', () => {
    expect(runMutant(breachFloor, ['--warn-only'])).toBe(0)
  })

  it('still exits 1 on that same breach WITHOUT --warn-only', () => {
    // The mutation has to be capable of failing, or the test above proves nothing.
    expect(runMutant(breachFloor, [])).toBe(1)
  })

  it('exits 0 when the script itself throws', () => {
    expect(runMutant(forceCrash, ['--warn-only'])).toBe(0)
  })

  it('still exits non-zero on that same crash WITHOUT --warn-only', () => {
    expect(runMutant(forceCrash, [])).not.toBe(0)
  })

  it('says so out loud when it swallows a crash, rather than looking absent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cache-budget-'))
    const file = join(dir, 'mutant.mjs')
    writeFileSync(file, forceCrash(SRC))
    const res = spawnSync(process.execPath, [file, '--warn-only'], { cwd: process.cwd(), encoding: 'utf8' })
    expect(res.stdout).toContain('CRASHED')
    expect(res.stdout).toContain('LIVE-035')
  })

  it('never reaches the trim in warn-only, so no rmSync can run', () => {
    // Structural, not behavioural: the trim branch must sit behind `else if`, downstream of the
    // warn-only arm, so there is no path from --warn-only to a delete.
    const warnArm = SRC.indexOf('if (WARN_ONLY) {')
    const overlapArm = SRC.indexOf('} else if (OVERLAP.length > 0) {')
    const rm = SRC.indexOf('rmSync(path.join(cacheDir')
    expect(warnArm, 'warn-only arm not found').toBeGreaterThan(-1)
    expect(overlapArm, 'the trim is no longer chained behind the warn-only arm').toBeGreaterThan(warnArm)
    expect(rm, 'the delete moved out of the trim chain').toBeGreaterThan(overlapArm)
  })

  it('installs the crash handler before ANY top-level work can throw', () => {
    // Ordering IS the guarantee. Its sibling scripts/check-shell-weight.mjs shipped this handler
    // two thirds of the way down the file, and anything throwing during module evaluation before
    // that point escaped it and exited 1 -- which in postbuild is a dead deploy. That was caught by
    // mutation, not by reading, so both files now assert the ordering.
    const handler = SRC.indexOf("process.on('uncaughtException'")
    const firstWork = SRC.indexOf('const ROOT = process.cwd()')
    expect(handler, 'no uncaughtException handler').toBeGreaterThan(-1)
    expect(
      handler,
      'the warn-only crash handler is installed AFTER top-level work begins, so a throw before it ' +
        'escapes and can fail a production build. Move it directly below the imports.',
    ).toBeLessThan(firstWork)
  })

  it('runs a real measurement on this repo and exits 0', () => {
    // The control. If this fails, the cases above pass for the wrong reason.
    execFileSync(process.execPath, [SCRIPT, '--warn-only'], { cwd: process.cwd() })
  })
})

describe('postbuild wiring', () => {
  it('invokes check:cache-budget bare, never --warn-only', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }
    const postbuild = pkg.scripts.postbuild ?? ''
    expect(postbuild).toContain('check-cache-budget.mjs')
    const invocation = /check-cache-budget\.mjs([^&|;]*)/.exec(postbuild)?.[1] ?? ''
    expect(
      invocation,
      'check-cache-budget.mjs runs in postbuild WITH --warn-only, which un-promotes the gate: an ' +
        'overflow would be reported in a log nobody reads and the deploy would ship it (ADR-970). ' +
        'It was promoted to blocking on 2026-08-19 (LIVE-029/LIVE-035, owner-approved) in the same ' +
        'change as the green build that proved it. If you are deliberately demoting it, say so ' +
        'here, in the backlog rows, and in scripts/guard-wiring.test.ts -- not just in package.json.',
    ).not.toContain('--warn-only')
  })
})
