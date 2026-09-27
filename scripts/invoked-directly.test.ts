import { describe, it, expect, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { invokedDirectly } from './lib/invoked-directly.mjs'

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// EVERY SCRIPT IN scripts/ ANSWERS "WAS I RUN, OR IMPORTED?" THE SAME WAY (backlog HYG-125).
//
// 🔴 THE SHAPE OF THE BUG. 48 scripts decided it by comparing `process.argv[1]` against
// `import.meta.url` by hand, and when that comparison is wrong the script's `main()` simply does not
// run: no output, exit 0. For a check script that reads as a PASS. It was wrong two ways:
//
//   1. SYMLINKS. `import.meta.url` is the realpath Node resolved the module through; `process.argv[1]`
//      is whatever was typed, symlinks intact. Any link above the script makes the two differ.
//   2. URL ENCODING. `` `file://${process.argv[1]}` `` compares an ENCODED url to a raw path, so one
//      space or non-ASCII character anywhere above the repo makes it permanently false.
//
// ⚪ WHAT THIS IS NOT. It is NOT a live production hole, and the row was corrected on exactly this
// point after measurement: the Vercel build path carries no symlink and is ASCII, so these gates did
// fire there. The cost is that none of them could be exercised by a mutation test, and that any
// developer whose checkout sits under a symlink or under a path with a space in it got a silent pass
// from all 48 at once. Six cases of check-shell-weight's own mutation test were green for that reason.
//
// TWO HALVES here, and the second is the one that matters. The SOURCE half freezes the set so a new
// script cannot reintroduce a hand-rolled comparison. The BEHAVIOUR half runs two real postbuild
// deploy gates THROUGH A SYMLINK and asserts they still execute and can still fail — each with a
// paired case that restores the old guard and watches the same run go silently green, so neither can
// pass for the wrong reason (ADR-970: a gate must not gain a way to pass without looking).
//
// ⚠️ Linux `mkdtemp` returns a real path, so "run it out of a temp dir" reproduces nothing on CI —
// that is a macOS accident (`/var` → `/private/var`). The link below is created explicitly.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..')
const SCRIPTS = join(ROOT, 'scripts')

/** Source lines with the comment-only ones dropped. The bug's own documentation quotes the broken
 *  spellings on purpose (scripts/preflight-lint.mjs keeps the institutional memory), so a scan that
 *  cannot tell code from commentary would either flag those or be defeated by them. */
function codeLines(src: string): string[] {
  return src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
}

const mjsFiles = (dir: string, prefix = ''): { path: string; src: string }[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return mjsFiles(join(dir, e.name), `${prefix}${e.name}/`)
    if (!e.name.endsWith('.mjs')) return []
    return [{ path: `${prefix}${e.name}`, src: readFileSync(join(dir, e.name), 'utf8') }]
  })

const FILES = mjsFiles(SCRIPTS)

/** The single script still allowed to compare by hand, and only in its ONE known spelling.
 *
 *  scripts/check-shell-weight.mjs is where this whole row was found, and its own fix (a local
 *  `invokedDirectly`) lands in the separate change that carries the HYG-125 backlog row. Editing it
 *  from here would collide with that tree line for line. The exception is therefore pinned to the
 *  exact pre-fix line: a THIRD spelling there fails this test, and once that change lands the file
 *  stops matching at all and this entry can be deleted. */
const PINNED_EXCEPTION = {
  path: 'check-shell-weight.mjs',
  line: 'if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()',
}

describe('scripts/: nobody hand-rolls the "was I invoked directly?" comparison', () => {
  it('reads a real corpus, so an empty scan cannot pass vacuously', () => {
    // Non-triviality first. A moved directory or a broken walk must not read as a clean bill of
    // health — the same failure mode this row is about, one level up.
    expect(FILES.length).toBeGreaterThan(70)
    expect(FILES.some((f) => f.path === 'lib/invoked-directly.mjs')).toBe(true)
  })

  it('no scripts/*.mjs compares process.argv[1] to import.meta.url itself', () => {
    const offenders: string[] = []
    for (const { path, src } of FILES) {
      for (const line of codeLines(src)) {
        if (!line.includes('process.argv[1]') || !line.includes('import.meta.url')) continue
        if (path === PINNED_EXCEPTION.path && line.trim() === PINNED_EXCEPTION.line) continue
        offenders.push(`${path}: ${line.trim()}`)
      }
    }
    expect(
      offenders,
      'These scripts decide "was I run or imported?" by comparing process.argv[1] to import.meta.url ' +
        'by hand. That comparison is false through a symlink (import.meta.url is the realpath, ' +
        'process.argv[1] is what was typed) and false again for an encoded path, and a false there ' +
        'means main() never runs: no output, exit 0, which for a check script reads as a PASS. Call ' +
        "invokedDirectly(import.meta.url) from scripts/lib/invoked-directly.mjs instead:\n  " +
        offenders.join('\n  '),
    ).toEqual([])
  })

  it('the one pinned exception is still exactly the line it was pinned as', () => {
    // If check-shell-weight.mjs has been fixed, it drops out of the scan and the exception is dead
    // weight that should be deleted. If it has been changed to some OTHER hand-rolled spelling, the
    // exception must not silently cover that.
    const file = FILES.find((f) => f.path === PINNED_EXCEPTION.path)
    expect(file, 'check-shell-weight.mjs is gone; delete PINNED_EXCEPTION with it').toBeDefined()
    const hand = codeLines(file!.src).filter(
      (l) => l.includes('process.argv[1]') && l.includes('import.meta.url'),
    )
    if (hand.length === 0) {
      expect(
        file!.src,
        'check-shell-weight.mjs no longer compares by hand, so HYG-125 has landed there. Delete ' +
          'PINNED_EXCEPTION and this case.',
      ).toMatch(/invokedDirectly/)
    } else {
      expect(hand.map((l) => l.trim())).toEqual([PINNED_EXCEPTION.line])
    }
  })

  it('the helper realpaths BOTH sides and decodes the URL rather than slicing it', () => {
    // Structural, because the two halves of the bug are exactly these two lines. A helper that
    // resolve()s instead of realpath()ing keeps mechanism 1; one that does string surgery on
    // `file://` keeps mechanism 2.
    // Its own header QUOTES both broken spellings, so read the code and not the commentary.
    const helper = codeLines(FILES.find((f) => f.path === 'lib/invoked-directly.mjs')!.src).join('\n')
    // `toContain('realpathSync')` is not enough: the import line alone satisfies it while the body
    // resolve()s. Caught by mutation — the symlink cases below failed and this one did not.
    expect(helper).toContain('return realpathSync(')
    expect(helper).toContain('fileURLToPath(importMetaUrl)')
    expect(helper, 'building the URL by concatenation is mechanism 2').not.toContain('`file://')
    // The fallback is load-bearing: realpathSync throws on a path that does not exist, which happens
    // for real in fixtures and --root invocations.
    expect(helper).toMatch(/catch\s*\{\s*\n?\s*return path\.resolve/)
  })
})

describe('invokedDirectly(): the comparison itself', () => {
  it('is false when imported, which is the entire reason the guard exists', () => {
    // vitest is argv[1] here, not this file. Nothing about the fix may change WHEN main() runs.
    expect(invokedDirectly(import.meta.url)).toBe(false)
  })

  it('is false with no argv[1] at all', () => {
    const saved = process.argv[1]
    try {
      // @ts-expect-error -- deliberately reproducing `node -e` / REPL, where argv[1] is absent.
      process.argv[1] = undefined
      expect(invokedDirectly(import.meta.url)).toBe(false)
    } finally {
      process.argv[1] = saved
    }
  })
})

// ── THE BEHAVIOUR HALF: two postbuild deploy gates, reached through a symlink ────────────────────

const temps: string[] = []
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true })
})

/** Stage `script` where its realpath differs from the path we invoke it by.
 *
 *  `<tmp>/real/<name>.mjs` with `<tmp>/real/lib` linked at the repo's own scripts/lib (so the
 *  helper import resolves), and `<tmp>/link` linked at `<tmp>/real`. Running `<tmp>/link/<name>.mjs`
 *  gives argv[1] under `link/` and import.meta.url under `real/` — one symlink, both mechanisms of
 *  "the two spellings of one file" in play, and NOT dependent on any platform accident. */
function stageBehindSymlink(script: string, mutate?: (src: string) => string): string {
  const tmp = mkdtempSync(join(tmpdir(), 'invoked-directly-'))
  temps.push(tmp)
  const real = join(tmp, 'real')
  mkdirSync(real, { recursive: true })
  mkdirSync(join(tmp, 'empty'), { recursive: true })
  symlinkSync(join(SCRIPTS, 'lib'), join(real, 'lib'), 'dir')
  symlinkSync(real, join(tmp, 'link'), 'dir')
  const src = readFileSync(join(SCRIPTS, script), 'utf8')
  writeFileSync(join(real, script), mutate ? mutate(src) : src)
  return tmp
}

/** Stage `script` under a directory whose name contains a SPACE, with no symlink in the path.
 *
 *  This is mechanism 2 on its own: `` `file://${process.argv[1]}` `` percent-encodes nothing, so the
 *  concatenated url carries a raw space while `import.meta.url` carries `%20`, and the two can never
 *  be equal. Same silent exit 0, from a checkout path rather than a link. */
function stageUnderSpacePath(script: string, mutate?: (src: string) => string): string {
  const tmp = mkdtempSync(join(tmpdir(), 'invoked-directly-'))
  temps.push(tmp)
  const dir = join(tmp, 'a dir with spaces')
  mkdirSync(join(dir, 'empty'), { recursive: true })
  symlinkSync(join(SCRIPTS, 'lib'), join(dir, 'lib'), 'dir')
  const src = readFileSync(join(SCRIPTS, script), 'utf8')
  writeFileSync(join(dir, script), mutate ? mutate(src) : src)
  return dir
}

/** Restore the exact pre-HYG-125 guard, so the paired case runs the OLD code on the NEW harness. */
function oldGuard(src: string): string {
  const out = src
    .replace(
      "import { invokedDirectly } from './lib/invoked-directly.mjs'",
      "import { pathToFileURL } from 'node:url'",
    )
    .replace(
      'invokedDirectly(import.meta.url)',
      'import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href',
    )
  // The mutation has to actually bite, or the paired case proves nothing.
  if (out.includes('invokedDirectly')) throw new Error('oldGuard() did not replace the guard')
  return out
}

/** The other pre-HYG-125 spelling, the one seven scripts carried: a url built by concatenation. */
function oldConcatGuard(src: string): string {
  const out = src
    .replace("import { invokedDirectly } from './lib/invoked-directly.mjs'\n", '')
    .replace('invokedDirectly(import.meta.url)', 'import.meta.url === `file://${process.argv[1]}`')
  if (out.includes('invokedDirectly')) throw new Error('oldConcatGuard() did not replace the guard')
  return out
}

function runAt(dir: string, script: string): { code: number; out: string } {
  try {
    const out = execFileSync(process.execPath, [join(dir, script), '--root', join(dir, 'empty')], {
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, VERCEL: '' },
    })
    return { code: 0, out }
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string }
    return { code: err.status, out: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

function runThroughLink(tmp: string, script: string): { code: number; out: string } {
  try {
    const out = execFileSync(process.execPath, [join(tmp, 'link', script), '--root', join(tmp, 'empty')], {
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, VERCEL: '' },
    })
    return { code: 0, out }
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string }
    return { code: err.status, out: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

// Both of these run in `postbuild`, where they gate a production deploy, and both fail with a
// message on a root that has no build in it — which is the condition used here because it is a real
// failure path of each gate, not a synthetic one.
const DEPLOY_GATES = [
  { script: 'check-build-fanout.mjs', says: 'no .next/server' },
  { script: 'check-notfound-routes.mjs', says: 'no .next' },
] as const

describe.each(DEPLOY_GATES)('THE GATE MUST RUN WHEN IT IS REACHED THROUGH A SYMLINK: $script', ({ script, says }) => {
  it('runs and still fails', () => {
    const { code, out } = runThroughLink(stageBehindSymlink(script), script)
    expect(code, `${script} exited 0 through a symlink — it never ran`).toBe(1)
    expect(out).toContain(says)
  })

  it('with the OLD guard restored, the same run goes SILENTLY GREEN', () => {
    // The negative control, and the whole evidence for the row: same harness, same fixture, same
    // failing condition, only the guard line differs. No output and exit 0 is what every developer
    // under a symlinked checkout was getting from all 48 scripts.
    const { code, out } = runThroughLink(stageBehindSymlink(script, oldGuard), script)
    expect(code, 'the old guard suddenly works through a symlink; re-derive the mechanism').toBe(0)
    expect(out.trim()).toBe('')
  })

  it('and the old guard DOES fail when no symlink is involved, so the condition can fail', () => {
    // Otherwise the case above would pass merely because the fixture is not a failing one.
    const tmp = stageBehindSymlink(script, oldGuard)
    try {
      execFileSync(process.execPath, [join(tmp, 'real', script), '--root', join(tmp, 'empty')], {
        encoding: 'utf8',
        stdio: 'pipe',
        env: { ...process.env, VERCEL: '' },
      })
      throw new Error(`${script} exited 0 on a root with no build — the control is not a failing one`)
    } catch (e) {
      expect((e as { status?: number }).status).toBe(1)
    }
  })
})

describe.each(DEPLOY_GATES)('AND WHEN ITS PATH HAS A SPACE IN IT: $script', ({ script, says }) => {
  it('runs and still fails', () => {
    const { code, out } = runAt(stageUnderSpacePath(script), script)
    expect(code, `${script} exited 0 under a path with a space — it never ran`).toBe(1)
    expect(out).toContain(says)
  })

  it('with the `file://` + argv[1] spelling restored, the same run goes SILENTLY GREEN', () => {
    // Mechanism 2, behaviourally rather than by reading: an ENCODED url compared against a raw path.
    // Seven scripts carried exactly this line.
    const { code, out } = runAt(stageUnderSpacePath(script, oldConcatGuard), script)
    expect(code, 'the concatenated url suddenly matches; re-derive the mechanism').toBe(0)
    expect(out.trim()).toBe('')
  })

  it('and that same spelling DOES fail from a path with no space, so the condition can fail', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'invoked-directly-plain-'))
    temps.push(tmp)
    mkdirSync(join(tmp, 'empty'), { recursive: true })
    symlinkSync(join(SCRIPTS, 'lib'), join(tmp, 'lib'), 'dir')
    writeFileSync(join(tmp, script), oldConcatGuard(readFileSync(join(SCRIPTS, script), 'utf8')))
    expect(runAt(tmp, script).code).toBe(1)
  })
})
