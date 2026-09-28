import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, symlinkSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

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
// ⚠️ WHEN PROMOTING TO BLOCKING: the last test here fails on purpose. Changing it is how the
// promotion becomes a reviewable line in a diff rather than a quiet edit to a package.json string.
// Do it in the SAME change as the green build that confirms the reading.

const SCRIPT = 'scripts/check-shell-weight.mjs'
const SRC = readFileSync(SCRIPT, 'utf8')

/** A directory holding a `.next/server/app` with no client-reference manifests, which is the
 *  script's "found no client-reference manifests" arm -- a real failure path, not a synthetic one. */
function emptyArtifactDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'shell-weight-'))
  mkdirSync(join(dir, '.next', 'server', 'app'), { recursive: true })
  return dir
}

/** Where the real `scripts/lib` lives, so a staged copy of the gate can resolve its own imports. */
const SCRIPTS_LIB = resolve(import.meta.dirname, 'lib')

/** Stage a copy of the gate in a fresh temp directory and return the path to run.
 *
 *  ⚠️ `lib` IS SYMLINKED IN, AND IT IS LOAD-BEARING. The gate imports `./lib/invoked-directly.mjs`
 *  (HYG-124), so a bare copy of the source cannot resolve it and node exits 1 with
 *  ERR_MODULE_NOT_FOUND before a line of the gate runs. That does not merely break the `--warn-only`
 *  cases — it makes the paired "still exits 1 WITHOUT the flag" cases pass for the WRONG REASON, on a
 *  module-resolution error rather than on the failure they claim to measure. Same vacuous proof this
 *  file was rescued from, arriving from the other direction. */
function stage(src: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'shell-weight-script-'))
  symlinkSync(SCRIPTS_LIB, join(dir, 'lib'), 'dir')
  const file = join(dir, 'mutant.mjs')
  writeFileSync(file, src)
  return file
}

function run(args: string[], cwd: string, src = SRC): { status: number; stdout: string } {
  const res = spawnSync(process.execPath, [stage(src), ...args], { cwd, encoding: 'utf8' })
  return { status: res.status ?? -1, stdout: res.stdout ?? '' }
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

  // ── 🔴 THE GATE MUST RUN WHEN IT IS REACHED THROUGH A SYMLINK (HYG-124) ────────────────────────
  // EVERY case above is a MUTATION case: it stages the script somewhere else and runs it. That proves
  // something only if the copy actually EXECUTES, and for a while it did not. The entry-point guard
  // compared `path.resolve(process.argv[1])` against `fileURLToPath(import.meta.url)`, and the second
  // is the path Node RESOLVED the module through — the realpath. On macOS `/var` is a symlink to
  // `/private/var`, so every `mkdtemp` invocation compared two spellings of one file, `main()` did not
  // run, and the script exited 0 printing NOTHING. Six cases in this file passed for that reason
  // instead of their own, and they are the cases that make `--warn-only` safe in postbuild.
  //
  // ⚠️ IT WOULD NOT HAVE BEEN CAUGHT HERE ON CI. Linux `mkdtemp` hands back a real path, so the cases
  // above were green on CI with the broken guard — the bug was invisible exactly where the deploy is
  // built. This case makes the symlink EXPLICIT rather than relying on the macOS `/var` accident, so
  // the guarantee is proven on the platform the deploy actually runs on too.
  describe('reached through a symlink, it still runs', () => {
    /** `<tmp>/real/gate.mjs`, invoked as `<tmp>/link/gate.mjs`, so argv[1] and the realpath differ by
     *  one link on EVERY platform rather than only where /var happens to be a symlink.
     *
     *  ⚠️ THE ROOT IS REALPATH'D FIRST, and the control case below is why. On macOS `mkdtemp` returns
     *  a path under `/var`, which is ITSELF a symlink to `/private/var` — so an unresolved `<tmp>` makes
     *  `viaReal` a symlinked path too, the old guard goes silently green there as well, and the case
     *  asserting "the condition CAN fail without a link" fails for a reason that has nothing to do
     *  with what it measures. Resolving the root makes `viaReal` genuinely link-free and `viaLink`
     *  differ from it by exactly the one link this describe block is about. */
    function stageBehindSymlink(src = SRC): { viaLink: string; viaReal: string } {
      const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'shell-weight-link-')))
      const real = join(tmp, 'real')
      mkdirSync(real, { recursive: true })
      symlinkSync(SCRIPTS_LIB, join(real, 'lib'), 'dir')
      symlinkSync(real, join(tmp, 'link'), 'dir')
      writeFileSync(join(real, 'gate.mjs'), src)
      return { viaLink: join(tmp, 'link', 'gate.mjs'), viaReal: join(real, 'gate.mjs') }
    }

    /** Restore the exact pre-HYG-124 guard, so the paired case runs the OLD code on this harness. */
    function oldGuard(src: string): string {
      const out = src
        .replace("import { invokedDirectly } from './lib/invoked-directly.mjs'", "import { fileURLToPath } from 'node:url'")
        .replace(
          'if (invokedDirectly(import.meta.url)) main()',
          'if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()',
        )
      // The mutation has to actually bite, or the paired case proves nothing.
      if (out.includes('invokedDirectly')) throw new Error('oldGuard() did not replace the guard')
      return out
    }

    const exec = (file: string, args: string[], cwd: string) => {
      const res = spawnSync(process.execPath, [file, ...args], { cwd, encoding: 'utf8' })
      return { status: res.status ?? -1, out: `${res.stdout ?? ''}${res.stderr ?? ''}` }
    }

    it('runs, and can still fail, when it is invoked through a symlinked path', () => {
      const { viaLink } = stageBehindSymlink()
      const blocking = exec(viaLink, [], emptyArtifactDir())
      expect(blocking.out.trim(), 'the gate said nothing at all, so main() never ran').not.toBe('')
      expect(blocking.status, 'the gate must still fail on an artifact with no manifests').toBe(1)

      const warn = exec(viaLink, ['--warn-only'], emptyArtifactDir())
      expect(warn.status, 'warn-only must never fail a build').toBe(0)
      expect(warn.out).toContain('warn-only')
    })

    it('with the OLD guard restored, that same run goes SILENTLY GREEN', () => {
      // The negative control, and the whole evidence for the row: same harness, same fixture, same
      // failing condition, only the guard line differs. No output and exit 0 is what six cases in
      // this file were getting, indistinguishable from a pass.
      const { viaLink } = stageBehindSymlink(oldGuard(SRC))
      const res = exec(viaLink, [], emptyArtifactDir())
      expect(res.status, 'the old guard suddenly works through a symlink; re-derive the mechanism').toBe(0)
      expect(res.out.trim()).toBe('')
    })

    it('and the OLD guard DOES fail with no symlink involved, so the condition can fail', () => {
      // Otherwise the case above would pass merely because the fixture is not a failing one.
      const { viaReal } = stageBehindSymlink(oldGuard(SRC))
      expect(exec(viaReal, [], emptyArtifactDir()).status).toBe(1)
    })
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
    expect(run(['--warn-only'], bare).status).toBe(0)
    expect(run([], bare).status).toBe(0)
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
