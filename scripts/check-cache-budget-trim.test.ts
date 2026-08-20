import { describe, it, expect, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  closeSync,
  existsSync,
  ftruncateSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHAT THE TRIM IS ALLOWED TO DELETE, PROVED BY DELETING THINGS (LIVE-048 · LIVE-029 · ADR-1086).
//
// 🔴 THE FAILURE THIS EXISTS FOR, and it is not hypothetical. `check:cache-budget`'s trim used to
// drop `.next/cache` subdirectories BIGGEST-FIRST. On 2026-08-18 it fired once on a real build and
// took the INCREMENTAL FETCH CACHE with it. The two builds that followed each compiled in ~2.4
// minutes and then hung in "Collecting page data using 3 workers" until BUILD_EXCEEDED_MAXIMUM_TIME
// at 46 minutes — page-data collection prerenders hundreds of Supabase-reading routes, and cold,
// every one of those reads goes over the network. A control on a healthy cache, carrying the same
// vercel.json change and nothing else, finished in 59 SECONDS. The cache was the cause.
//
// The fix was to name the compiler caches and iterate THAT list. Until this file, the only thing
// holding that fix in place was a STATIC probe over the script's text: does `COMPILER_CACHE_DIRS`
// exist, does the loop header mention it, is there exactly one `rmSync`. Every one of those can be
// satisfied by a rewrite that still deletes the fetch cache — a size-sorted fallback inside the
// loop, a name list built by `readdirSync`, a second delete spelled `rm()` — which is the
// shape-not-truth failure AGENTS.md names, guarding the single most expensive defect in this repo's
// history with a grep.
//
// So this file measures the CONSEQUENCE. Every case builds a real `.next/cache` on disk, runs the
// REAL script against it with spawnSync, and then looks at what is still there. Nothing is mocked
// and no helper is extracted for testability: the thing under test is the file `postbuild` runs.
//
// The fixtures are SPARSE FILES. `ftruncate` gives a file an `lstat().size` of 3 GiB while
// occupying zero blocks, and `measure()` in the script sums `lstat().size`, so the tree is
// multi-gigabyte to the code under test and free to the disk running the test.
//
// SIZES ARE DERIVED FROM THE SCRIPT'S OWN CONSTANTS, never hardcoded. A fixture pinned to today's
// 1.40 GB trim point would quietly stop straddling the threshold the day PACKED_PER_RAW is
// re-derived, and every case below would pass by never triggering the trim at all.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const SCRIPT = path.join(import.meta.dirname, 'check-cache-budget.mjs')
const SRC = readFileSync(SCRIPT, 'utf8')

/** Read a numeric constant out of the script, so fixtures track the thresholds they are testing. */
function constant(name: string): number {
  const m = new RegExp(`^const ${name} = ([0-9.]+)`, 'm').exec(SRC)
  expect(m, `${name} is no longer a plain numeric constant in ${path.basename(SCRIPT)}`).not.toBeNull()
  return Number(m![1])
}

const PACKED_PER_RAW = constant('PACKED_PER_RAW')
const VERCEL_CEILING_GB = constant('VERCEL_CEILING_GB')
const RESERVE_GB = constant('RESERVE_GB')

/** Raw bytes on disk at which the trim fires: the packed trim point converted back through the ratio. */
const TRIM_RAW = ((VERCEL_CEILING_GB - RESERVE_GB) * 1000 ** 3) / PACKED_PER_RAW

const temps: string[] = []
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})

/**
 * Build a fake project root whose `.next/cache` holds the named children at the given sizes,
 * expressed as MULTIPLES OF THE TRIM POINT so the arithmetic is readable.
 */
function fixture(children: Record<string, number>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'cache-trim-'))
  temps.push(root)
  const cache = path.join(root, '.next', 'cache')
  mkdirSync(cache, { recursive: true })
  for (const [name, share] of Object.entries(children)) {
    const bytes = Math.round(TRIM_RAW * share)
    if (name.includes('.')) {
      // A loose file directly under .next/cache — not a directory, and not addressable by the trim.
      sparse(path.join(cache, name), bytes)
      continue
    }
    mkdirSync(path.join(cache, name), { recursive: true })
    sparse(path.join(cache, name, 'blob.bin'), bytes)
  }
  return root
}

function sparse(file: string, bytes: number): void {
  const fd = openSync(file, 'w')
  try {
    ftruncateSync(fd, bytes)
  } finally {
    closeSync(fd)
  }
}

/** Run the real script (or a mutant of it) from inside a fixture root. */
function run(root: string, args: string[] = [], src = SRC): { status: number; out: string } {
  let file = SCRIPT
  if (src !== SRC) {
    const dir = mkdtempSync(path.join(tmpdir(), 'cache-trim-mutant-'))
    temps.push(dir)
    file = path.join(dir, 'mutant.mjs')
    writeFileSync(file, src)
  }
  const res = spawnSync(process.execPath, [file, ...args], { cwd: root, encoding: 'utf8' })
  return { status: res.status ?? -1, out: `${res.stdout ?? ''}${res.stderr ?? ''}` }
}

const has = (root: string, child: string) => existsSync(path.join(root, '.next', 'cache', child))

describe('the trim drops compiler caches by name and nothing else', () => {
  it('deletes the compiler cache and leaves the fetch cache standing', () => {
    // 0.9 + 0.4 = 1.3x the trim point, so the trim MUST fire; dropping turbopack alone brings it to
    // 0.4x, so it must then stop rather than reaching for the next-biggest thing.
    const root = fixture({ turbopack: 0.9, 'fetch-cache': 0.4, images: 0.05 })
    const { status, out } = run(root)

    expect(out, 'the fixture did not cross the trim point, so this case proves nothing').toContain(
      'trimmed the build cache',
    )
    expect(has(root, 'turbopack'), 'the compiler cache survived, so nothing was actually trimmed').toBe(false)
    expect(
      has(root, 'fetch-cache'),
      'THE 2026-08-18 DEFECT IS BACK: the trim deleted the incremental fetch cache. On a real build ' +
        'that hangs "Collecting page data" until BUILD_EXCEEDED_MAXIMUM_TIME at 46 minutes. The trim ' +
        'must only remove names in COMPILER_CACHE_DIRS.',
    ).toBe(true)
    expect(has(root, 'images'), 'images is in NEVER_TRIM_DIRS and must survive').toBe(true)
    expect(out).toContain('.next/cache/turbopack')
    expect(status).toBe(0)
  })

  it('drops every compiler cache before it gives up, and never the fetch cache', () => {
    // The fetch cache ALONE is over the trim point. There is no arrangement of legal deletes that
    // gets under it, and the only illegal one is the delete that killed two builds.
    const root = fixture({ 'fetch-cache': 1.2, turbopack: 0.3, swc: 0.2 })
    const { status, out } = run(root)

    expect(has(root, 'turbopack')).toBe(false)
    expect(has(root, 'swc')).toBe(false)
    expect(
      has(root, 'fetch-cache'),
      'the trim deleted the fetch cache when it ran out of compiler caches to drop. Being over ' +
        'budget is not a licence: it must report STILL OVER and stop.',
    ).toBe(true)
    expect(out).toContain('STILL OVER')
    expect(status).toBe(0)
  })

  it('leaves an unrecognised child directory alone and names it in the output', () => {
    // Fail-closed. A directory this script has never heard of is 1.3x the trim point all by itself,
    // and the honest answer is to keep it and say so rather than to delete something unknown on a
    // production build.
    const root = fixture({ 'quantum-cache': 1.3, 'fetch-cache': 0.1 })
    const { status, out } = run(root)

    expect(out).toContain('trimmed the build cache')
    expect(
      has(root, 'quantum-cache'),
      'an UNRECOGNISED directory was deleted. Any future Next version that adds a child under ' +
        '.next/cache would be trimmed sight-unseen, which is exactly how the fetch cache was lost.',
    ).toBe(true)
    expect(has(root, 'fetch-cache')).toBe(true)
    expect(
      out,
      'the gate deleted nothing but also said nothing. A fail-safe that declines to act silently is ' +
        'an invisible regression (AGENTS.md); it has to name what it did not recognise.',
    ).toContain('Not recognised')
    expect(out).toContain('quantum-cache')
    expect(status).toBe(0)
  })

  it('names a loose top-level file too, so the composition reconciles with its own total', () => {
    // DEFECT 3. Only directories used to be listed, while measure() counted everything, so a loose
    // file was bytes with no address — worst on the build that was over the ceiling, under a line
    // telling a human to go read the composition.
    const root = fixture({ 'orphan-blob.bin': 1.3, 'fetch-cache': 0.1 })
    const { out } = run(root)

    expect(existsSync(path.join(root, '.next', 'cache', 'orphan-blob.bin')), 'a loose file was deleted').toBe(true)
    expect(
      out,
      'a loose top-level file under .next/cache is counted in the total but never named, so growth ' +
        'there is invisible in the one report that is supposed to give growth an address.',
    ).toContain('orphan-blob.bin')
    expect(out).toContain('Not recognised')
  })

  it('does not trim at all when the cache is under the trim point', () => {
    // The non-triviality control. Without it, a script that had been broken into deleting nothing
    // ever would make every assertion above pass.
    const root = fixture({ turbopack: 0.5, 'fetch-cache': 0.2 })
    const { status, out } = run(root)

    expect(out).not.toContain('trimmed the build cache')
    expect(has(root, 'turbopack')).toBe(true)
    expect(has(root, 'fetch-cache')).toBe(true)
    expect(status).toBe(0)
  })
})

describe('--warn-only never reaches the trim', () => {
  it('leaves an over-budget cache completely untouched and still exits 0', () => {
    const root = fixture({ turbopack: 0.9, 'fetch-cache': 0.4 })
    const { status, out } = run(root, ['--warn-only'])

    expect(
      has(root, 'turbopack'),
      'warn-only DELETED something. postbuild runs this on every production build in warn-only ' +
        'precisely because the trim is the half that killed builds; it must measure and print only.',
    ).toBe(true)
    expect(has(root, 'fetch-cache')).toBe(true)
    expect(out).toContain('WOULD have been trimmed')
    expect(out).toContain('Nothing was deleted')
    expect(status).toBe(0)
  })

  it('still reports what it does not recognise, because reporting is its whole job', () => {
    const root = fixture({ 'quantum-cache': 1.3, 'orphan-blob.bin': 0.2 })
    const { out } = run(root, ['--warn-only'])
    expect(out).toContain('Not recognised')
    expect(out).toContain('quantum-cache')
    expect(out).toContain('orphan-blob.bin')
  })
})

describe('the assertions above can actually fail', () => {
  // 🔴 THE SHARPEST CASE IN THIS FILE. Everything above asserts an ABSENCE of harm, and an absence
  // is exactly what a test that has quietly stopped exercising anything also reports. So put the
  // 2026-08-18 defect back, byte for byte in spirit, and require the fixtures to catch it.

  /** Put the loop back on the size-sorted list — the shape of the 2026-08-18 trim. */
  const sizeSorted = (src: string) =>
    src.replace('for (const name of COMPILER_CACHE_DIRS) {', 'for (const [name] of cacheParts) {')
  /** Take the in-loop guard out too, which is what the file looked like on the day it fired. */
  const noSecondBelt = (src: string) =>
    src.replace(/\n *if \(NEVER_TRIM_DIRS\.includes\(name\)\) continue[^\n]*/, '')

  // THE FIXTURE THAT SEPARATES THE TWO POLICIES, and getting it right took a failing run: a cache
  // where dropping the biggest compiler cache ALONE gets under the trim point cannot tell by-name
  // from biggest-first, because both stop after one delete and both keep the fetch cache. It has to
  // still be over after the first delete, with the fetch cache as the biggest remaining thing:
  //
  //     start   0.8 turbopack + 0.7 fetch-cache + 0.5 swc  = 2.0x the trim point
  //     by name    drop turbopack -> 1.2x, still over; drop swc -> 0.7x, under.  FETCH CACHE KEPT
  //     biggest    drop turbopack -> 1.2x, still over; next biggest is fetch-cache.  GONE
  const DISCRIMINATING = { turbopack: 0.8, 'fetch-cache': 0.7, swc: 0.5 }

  it('the 2026-08-18 trim, reconstructed, deletes the fetch cache where this one does not', () => {
    const mutant = noSecondBelt(sizeSorted(SRC))
    expect(mutant, 'the trim loop changed shape — re-point this mutation').not.toBe(SRC)
    // The OVERLAP declaration also mentions NEVER_TRIM_DIRS, so pin the IN-LOOP guard specifically.
    expect(mutant).not.toContain('if (NEVER_TRIM_DIRS.includes(name)) continue')

    const real = fixture(DISCRIMINATING)
    run(real, [])
    const broken = fixture(DISCRIMINATING)
    run(broken, [], mutant)

    expect(
      has(broken, 'fetch-cache'),
      'the reconstructed 2026-08-18 trim did NOT delete the fetch cache, so this fixture no longer ' +
        'reproduces the condition that killed two builds and every by-name assertion above is ' +
        'passing vacuously. Re-tune the shares so the cache is STILL OVER after the first delete.',
    ).toBe(false)

    // Same tree, same threshold, same over-budget condition — only the policy differs.
    expect(has(real, 'fetch-cache'), 'the real script lost the fetch cache on the discriminating tree').toBe(
      true,
    )
    expect(has(real, 'turbopack')).toBe(false)
    expect(has(real, 'swc'), 'the real script should have needed a SECOND compiler delete here').toBe(false)
  })

  it('the second belt alone saves the fetch cache even if the loop goes back to biggest-first', () => {
    // Defence in depth, measured rather than asserted: with ONLY the loop reverted, the in-loop
    // NEVER_TRIM_DIRS guard still refuses the delete. Two independent things have to be undone in
    // one edit to lose the fetch cache again.
    const root = fixture(DISCRIMINATING)
    run(root, [], sizeSorted(SRC))

    expect(has(root, 'fetch-cache'), 'NEVER_TRIM_DIRS is not being consulted inside the loop').toBe(true)
    expect(has(root, 'turbopack'), 'the mutant must still be capable of deleting something').toBe(false)
  })

  it('the fixture sizes really do straddle the trim point', () => {
    // Guards the guard: if TRIM_RAW were ever read as NaN or 0, every fixture would be zero bytes
    // and "nothing was deleted" would be true for the wrong reason.
    expect(Number.isFinite(TRIM_RAW)).toBe(true)
    expect(TRIM_RAW).toBeGreaterThan(1e9)
    expect(PACKED_PER_RAW).toBeGreaterThan(0)
    expect(PACKED_PER_RAW).toBeLessThan(1)
  })
})

describe('the lists the trim is restricted to', () => {
  it('refuses to trim anything at all if the two lists ever overlap', () => {
    // Belt and braces. If a future edit puts fetch-cache into COMPILER_CACHE_DIRS, the whole trim
    // stops and says why, instead of quietly repeating 2026-08-18.
    const overlapped = SRC.replace(
      /const COMPILER_CACHE_DIRS = \[[^\]]*\]/,
      "const COMPILER_CACHE_DIRS = ['turbopack', 'fetch-cache']",
    )
    expect(overlapped).not.toBe(SRC)

    const root = fixture({ turbopack: 0.9, 'fetch-cache': 0.4 })
    const { status, out } = run(root, [], overlapped)

    expect(has(root, 'fetch-cache')).toBe(true)
    expect(has(root, 'turbopack'), 'the overlap guard must stop the ENTIRE trim, not just the unsafe entry').toBe(
      true,
    )
    expect(out).toContain('did not trim anything')
    expect(status).toBe(0)
  })

  it('names only cache directories Next actually writes', () => {
    // The four compiler caches and the two protected ones are read out of Next's own source rather
    // than guessed. Verified 2026-08-19 against next@16.3.1:
    //   .next/cache/turbopack     next/dist/cli/next-post-build.js, lib/turbopack-cache-seed.js
    //   .next/cache/rspack        next/dist/build/webpack-config.js, server/dev/hot-reloader-rspack.js
    //   .next/cache/webpack       next/dist/build/webpack-config.js  (`cacheDirectory`)
    //   .next/cache/swc           next/dist/build/webpack-config.js  (`swcCacheDir`)
    //   .next/cache/fetch-cache   next/dist/server/lib/incremental-cache/file-system-cache.js
    //   .next/cache/images        next/dist/server/image-optimizer.js
    // A `.next/cache` child outside those six is unrecognised BY CONSTRUCTION, which is what the
    // fail-closed cases above depend on.
    const compiler = /const COMPILER_CACHE_DIRS = \[([^\]]*)\]/.exec(SRC)?.[1] ?? ''
    const never = /const NEVER_TRIM_DIRS = \[([^\]]*)\]/.exec(SRC)?.[1] ?? ''
    for (const name of ['turbopack', 'rspack', 'webpack', 'swc']) expect(compiler).toContain(name)
    for (const name of ['fetch-cache', 'images']) expect(never).toContain(name)
    expect(compiler, 'the fetch cache must never be trimmable').not.toContain('fetch-cache')
  })
})
