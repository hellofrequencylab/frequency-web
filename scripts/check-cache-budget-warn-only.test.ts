import { describe, it, expect } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// WARN-ONLY MUST NEVER BE ABLE TO FAIL A PRODUCTION BUILD.
//
// `postbuild` runs on Vercel and a non-zero exit there kills the deploy. check:cache-budget is in
// postbuild as `--warn-only` under LIVE-035, and the ONLY reason that is safe is the guarantee this
// file locks down: in warn-only the script measures, prints, and exits 0 no matter what it finds or
// what goes wrong inside it.
//
// That guarantee is one `process.exit(1)` away from being false, and the failure would be invisible
// in review -- a new arm added months from now for a good reason, in a file whose other arms are
// supposed to exit 1. This is the gate that notices (AGENTS.md). It is proven by MUTATION rather
// than by reading: each case rewrites the script into a temp copy that forces the condition, then
// runs it for real.
//
// ⚠️ WHEN PROMOTING TO BLOCKING: the last test here is the one that will fail, on purpose. Changing
// it is how the promotion becomes a deliberate, reviewable line in a diff rather than a quiet edit
// to a string in package.json. Do it in the SAME change as the green build that confirms
// PACKED_PER_RAW -- see this file's header and docs/DEPLOY-SAFETY.md §10.

const SCRIPT = 'scripts/check-cache-budget.mjs'
const SRC = readFileSync(SCRIPT, 'utf8')

/** Write a mutated copy of the script into a temp dir and run it from the repo root. */
function runMutant(mutate: (src: string) => string, args: string[] = []): number {
  const dir = mkdtempSync(join(tmpdir(), 'cache-budget-'))
  const file = join(dir, 'mutant.mjs')
  writeFileSync(file, mutate(SRC))
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
    /^const nodeModules = measure\('node_modules'\)$/m,
    "const nodeModules = (() => { throw new Error('simulated measurement failure') })()",
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
  it('invokes check:cache-budget with --warn-only, never bare', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }
    const postbuild = pkg.scripts.postbuild ?? ''
    expect(postbuild).toContain('check-cache-budget.mjs')
    expect(
      postbuild,
      'check-cache-budget.mjs is in postbuild WITHOUT --warn-only. That makes it able to fail a ' +
        'production deploy on a constant (PACKED_PER_RAW) that no real build has confirmed yet. ' +
        'If you are deliberately promoting it to blocking, update this test in the same change as ' +
        'the green build that settles the constant (LIVE-035, docs/DEPLOY-SAFETY.md §10).',
    ).toContain('check-cache-budget.mjs --warn-only')
  })
})
