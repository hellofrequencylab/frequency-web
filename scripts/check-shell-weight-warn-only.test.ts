import { describe, it, expect, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// WARN-ONLY MUST NEVER BE ABLE TO FAIL A PRODUCTION BUILD.
//
// Same contract, same reasoning and the same proof method as
// scripts/check-cache-budget-warn-only.test.ts. `postbuild` runs on Vercel and a non-zero exit there
// kills the deploy. check:shell-weight is in postbuild as `--warn-only` under LIVE-035, and the only
// reason that is safe is the guarantee locked down here: in warn-only it measures, prints, and exits
// 0 whatever it finds and whatever goes wrong inside it.
//
// This gate is a sharper case than its sibling. It has exactly ONE reading in its life and that
// reading is unconfirmed in BOTH directions -- it exited 1 naming lib/pricing/feature-meters.ts on an
// artifact built plausibly before five editor bodies moved behind dynamic(). So the first real thing
// it does may well be to report a leak, and if that report could fail the build it would fail a
// deploy over a number nobody has confirmed yet.
//
// Proven by MUTATION rather than by reading: each case forces the condition and runs the script for
// real, and every case has a paired case asserting the same condition DOES fail without the flag, so
// the guarantee cannot pass for the wrong reason.
//
// ⚠️ AND "RUNS THE SCRIPT FOR REAL" IS ITSELF ASSERTED, at the bottom of this file, because for a
// while it was not true (HYG-125). Read `stage()` before adding a case here: it invokes the script
// through a symlink on purpose.
//
// ⚠️ WHEN PROMOTING TO BLOCKING: the last test here fails on purpose. Changing it is how the
// promotion becomes a reviewable line in a diff rather than a quiet edit to a package.json string.
// Do it in the SAME change as the green build that confirms the reading.

const SCRIPTS = import.meta.dirname
const SCRIPT = 'scripts/check-shell-weight.mjs'
const SRC = readFileSync(SCRIPT, 'utf8')

const temps: string[] = []
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true })
})

/** A directory holding a `.next/server/app` with no client-reference manifests, which is the
 *  script's "found no client-reference manifests" arm -- a real failure path, not a synthetic one. */
function emptyArtifactDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'shell-weight-'))
  temps.push(dir)
  mkdirSync(join(dir, '.next', 'server', 'app'), { recursive: true })
  return dir
}

/** Stage the script (or a mutant of it) so the path we INVOKE it by is NOT the path Node resolves it
 *  to, and hand back both spellings.
 *
 *  🔴 THE SYMLINK IS THE POINT, NOT SCENERY (HYG-125). Every case in this file is a mutation case:
 *  it forces a condition and runs the script for real. All of them were once green over a script that
 *  never executed a single line. The old direct-invocation guard compared a `path.resolve`d
 *  `process.argv[1]` — symlinks intact — against `fileURLToPath(import.meta.url)`, which is the
 *  realpath Node resolved the module through. Staged in an OS temp dir the two differ, `main()` never
 *  runs, and the script exits 0 having printed nothing: exactly how a check script spells PASS. On
 *  macOS every `mkdtemp` path sits under the `/var` -> `/private/var` link, so six cases here proved
 *  nothing at all there, while on Linux `mkdtemp` returns a real path and they happened to work —
 *  a guarantee that held by platform accident. Creating the link EXPLICITLY makes the hostile shape
 *  the default everywhere, so these cases cannot go quietly vacuous again.
 *
 *  `<tmp>/real/mutant.mjs`, with the repo's own `scripts/lib` linked beside it so the script's
 *  `./lib/invoked-directly.mjs` import resolves, and `<tmp>/link` linked at `<tmp>/real`.
 *
 *  ⚠️ `<tmp>` IS realpathSync'd, AND THE `real` HALF IS WHY. `mkdtemp` hands back a path under `/var`
 *  on macOS, and `/var` is itself the symlink this whole file is about — so an unresolved root makes
 *  `real` a symlinked path too, and the paired case that runs there to show the old guard CAN fail
 *  gets the same silent exit 0 as the link case. That control then fails, and a control that cannot
 *  fail is this file's own subject reappearing inside its proof (HYG-129). Resolving the root is what
 *  makes `real` genuinely link-free and `link` differ from it by exactly one link. */
function stage(src = SRC): { link: string; real: string } {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'shell-weight-script-')))
  temps.push(tmp)
  const real = join(tmp, 'real')
  mkdirSync(real, { recursive: true })
  symlinkSync(join(SCRIPTS, 'lib'), join(real, 'lib'), 'dir')
  symlinkSync(real, join(tmp, 'link'), 'dir')
  writeFileSync(join(real, 'mutant.mjs'), src)
  return { link: join(tmp, 'link', 'mutant.mjs'), real: join(real, 'mutant.mjs') }
}

function exec(file: string, args: string[], cwd: string): { status: number; stdout: string; stderr: string } {
  const res = spawnSync(process.execPath, [file, ...args], { cwd, encoding: 'utf8' })
  return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' }
}

/** Run the script through the SYMLINKED spelling — the shape that used to disarm every case here. */
function run(args: string[], cwd: string, src = SRC): { status: number; stdout: string; stderr: string } {
  return exec(stage(src).link, args, cwd)
}

/** Force an unhandled throw after the warn-only handler is installed. */
const forceCrash = (src: string) =>
  src.replace(
    /^const ROOT = process\.cwd\(\)$/m,
    "const ROOT = (() => { throw new Error('simulated shell-weight failure') })()",
  )

describe('check:shell-weight warn-only cannot fail a build', () => {
  it('exits 0 when the manifest arm fails', () => {
    expect(run(['--warn-only'], emptyArtifactDir()).status).toBe(0)
  })

  it('still exits 1 on that same failure WITHOUT --warn-only', () => {
    // The condition has to be capable of failing, or the test above proves nothing.
    expect(run([], emptyArtifactDir()).status).toBe(1)
  })

  it('says so out loud rather than looking like it passed', () => {
    const { stdout } = run(['--warn-only'], emptyArtifactDir())
    expect(stdout).toContain('warn-only')
    expect(stdout).toContain('LIVE-035')
  })

  it('exits 0 when the script itself throws', () => {
    expect(run(['--warn-only'], emptyArtifactDir(), forceCrash(SRC)).status).toBe(0)
  })

  it('still exits non-zero on that same crash WITHOUT --warn-only', () => {
    expect(run([], emptyArtifactDir(), forceCrash(SRC)).status).not.toBe(0)
  })

  it('routes every failure through bail(), so no arm can exit directly', () => {
    // Structural. A new arm added later that calls process.exit(1) directly would bypass the flag
    // and take a production deploy with it, and would be invisible in review.
    const body = SRC.slice(SRC.indexOf('const bail ='))
    expect(body).not.toContain('process.exit(1)')
    expect(SRC).toContain('const bail = (code) =>')
  })

  it('installs the crash handler before ANY top-level work can throw', () => {
    // This is not decoration; the mutation test above caught it for real. The handler was first
    // placed next to `fail()`, two thirds of the way down the file, so anything throwing during
    // module evaluation before that point escaped it and exited 1 -- in postbuild, that is a dead
    // deploy. Ordering is the guarantee, so the ordering is asserted.
    const handler = SRC.indexOf("process.on('uncaughtException'")
    const firstWork = SRC.indexOf('const ROOT = process.cwd()')
    expect(handler, 'no uncaughtException handler').toBeGreaterThan(-1)
    expect(
      handler,
      'the warn-only crash handler is installed AFTER top-level work begins, so a throw before it ' +
        'escapes and can fail a production build. Move it directly below the imports.',
    ).toBeLessThan(firstWork)
  })

  it('exits 0 with no .next at all, in both modes', () => {
    const bare = mkdtempSync(join(tmpdir(), 'shell-weight-bare-'))
    temps.push(bare)
    expect(run(['--warn-only'], bare).status).toBe(0)
    expect(run([], bare).status).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// AND THE CASES ABOVE ACTUALLY RAN THE SCRIPT (HYG-125).
//
// Every assertion above is of the form "forced this condition, ran the script, got exit N". A script
// that never runs exits 0 in silence, which satisfies half of them outright — so without the pair
// below, "warn-only cannot fail a build" is indistinguishable from "nothing was ever executed". That
// was not hypothetical: it is the state this file was in, and the reason the gate's own proof had to
// be repaired rather than merely re-read.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Restore the exact pre-HYG-125 guard, so a paired case runs the OLD code on the SAME harness. */
function oldGuard(src: string): string {
  const out = src
    .replace(
      "import { invokedDirectly } from './lib/invoked-directly.mjs'",
      "import { fileURLToPath } from 'node:url'",
    )
    .replace(
      'if (invokedDirectly(import.meta.url)) main()',
      'if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()',
    )
  // The mutation has to actually bite, or the paired case proves nothing.
  if (out.includes('if (invokedDirectly(')) throw new Error('oldGuard() did not replace the guard')
  if (!out.includes('fileURLToPath(import.meta.url)')) throw new Error('oldGuard() restored nothing')
  return out
}

describe('the mutation cases above are running the real script', () => {
  it('reached through a symlink the script RUNS, and still fails on a failing fixture', () => {
    const { status, stderr } = run([], emptyArtifactDir())
    expect(
      status,
      'exit 0 through a symlinked path means main() never ran, so every case in this file is ' +
        'asserting against a script that executed nothing. Realpath BOTH sides of the ' +
        'direct-invocation guard (scripts/lib/invoked-directly.mjs).',
    ).toBe(1)
    expect(stderr).toContain('found no client-reference manifests')
  })

  it('with the OLD guard restored, that same run goes SILENTLY GREEN', () => {
    // The negative control, and the whole evidence for the row: same harness, same fixture, same
    // failing condition — only the guard line differs. Exit 0 with NO output is what this file was
    // getting on macOS, from a script that never executed a line.
    const { status, stdout, stderr } = run([], emptyArtifactDir(), oldGuard(SRC))
    expect(status, 'the old guard suddenly matches through a symlink; re-derive the mechanism').toBe(0)
    expect(`${stdout}${stderr}`.trim()).toBe('')
  })

  it('and the old guard DOES fail with no symlink involved, so the fixture is a failing one', () => {
    // Otherwise the case above would pass merely because the fixture cannot fail.
    expect(exec(stage(oldGuard(SRC)).real, [], emptyArtifactDir()).status).toBe(1)
  })
})

describe('postbuild wiring', () => {
  it('invokes check:shell-weight BLOCKING (promoted 2026-08-19), never warn-only', () => {
    // The assertion this replaces demanded --warn-only, and its own message named the exit ramp:
    // "if you are deliberately promoting it, update this test in the same change as the green
    // build that confirms the reading." That is this change. The reading is no longer the one
    // unconfirmed number the old message worried about: the gate printed green on TWO production
    // artifacts (2026-08-19, 17:14Z and 18:13Z, both 1010 KB of the 1400 KB budget across 21
    // chunks, all 8 admin module bodies lazy, positive control present), and the owner said
    // "promote it." So the pin inverts: warn-only in postbuild is now a SILENT DEMOTION of an
    // owner-promoted gate. The warn-only MODE itself stays tested above -- the flag still exists
    // for manual runs, and its crash-isolation guarantees are what made the confirming readings
    // safe to take in the first place. Its sibling check-cache-budget deliberately KEEPS the flag
    // (its action is a trim, it has killed two builds); LIVE-035 carries that separate decision.
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }
    const postbuild = pkg.scripts.postbuild ?? ''
    expect(postbuild).toContain('check-shell-weight.mjs')
    const shellArgs = /check-shell-weight\.mjs([^&|;]*)/.exec(postbuild)?.[1] ?? ''
    expect(
      /--warn-only/.test(shellArgs),
      'check-shell-weight.mjs runs in postbuild WITH --warn-only, but the owner promoted it on ' +
        '2026-08-19 after two green production readings. Re-adding the flag silently demotes an ' +
        'owner-promoted gate; if that demotion is deliberate, it needs its own decision and this ' +
        'test updated with it (LIVE-035, docs/DEPLOY-SAFETY.md §10).',
    ).toBe(false)
  })
})
