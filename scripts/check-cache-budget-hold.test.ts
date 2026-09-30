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
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE HELD GENERATION, PROVED BY RUNNING THE REAL SCRIPTS (HYG-140 · ADR-1656).
//
// The Turbopack cache grows on every warm build (it is a log-structured database and the engine
// decides when to compact), so on 2026-09-29 the trim fired every few production builds and each
// trim made the next build compile cold. `prebuild` now hard-links the cache a build restored, and
// when the cache that build wrote is over the trim point the gate puts the restored one back rather
// than deleting the compiler cache. These cases build real `.next/cache` trees, run the real
// `postbuild` and `prebuild` files with spawnSync, and look at what is on disk afterwards, the same
// way scripts/check-cache-budget-trim.test.ts proves the trim.
//
// Sizes are SPARSE FILES, and they are derived from the script's own constants, so a re-derived
// PACKED_PER_RAW moves every fixture with it instead of quietly stopping them straddling the line.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const GATE = path.join(import.meta.dirname, 'check-cache-budget.mjs')
const SNAPSHOT = path.join(import.meta.dirname, 'snapshot-turbopack-cache.mjs')
const SRC = readFileSync(GATE, 'utf8')
const SNAP_SRC = readFileSync(SNAPSHOT, 'utf8')

function constant(name: string): number {
  const m = new RegExp(`^const ${name} = ([0-9.]+)`, 'm').exec(SRC)
  expect(m, `${name} is no longer a plain numeric constant in check-cache-budget.mjs`).not.toBeNull()
  return Number(m![1])
}
function stringConstant(src: string, name: string): string {
  const m = new RegExp(`^const ${name} = '([^']+)'`, 'm').exec(src)
  expect(m, `${name} is no longer a plain string constant`).not.toBeNull()
  return m![1]
}

const PACKED_PER_RAW = constant('PACKED_PER_RAW')
const VERCEL_CEILING_GB = constant('VERCEL_CEILING_GB')
const RESERVE_GB = constant('RESERVE_GB')
const HOLD_LIMIT = constant('HOLD_LIMIT')
const HELD_DIR = stringConstant(SRC, 'HELD_DIR')
const HELD_STATE_FILE = stringConstant(SRC, 'HELD_STATE_FILE')

/** Raw bytes at which the trim fires. */
const TRIM_RAW = ((VERCEL_CEILING_GB - RESERVE_GB) * 1000 ** 3) / PACKED_PER_RAW
const VERSION = 'v16.3.6-a758ffcf'

const temps: string[] = []
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})

function sparse(file: string, bytes: number): void {
  mkdirSync(path.dirname(file), { recursive: true })
  const fd = openSync(file, 'w')
  try {
    ftruncateSync(fd, Math.round(bytes))
  } finally {
    closeSync(fd)
  }
}

interface Tree {
  /** This build's Turbopack cache, as a multiple of the trim point. */
  live: number
  /** The restored generation prebuild linked, as a multiple of the trim point; omit for none. */
  held?: number
  /** Version directory the restored generation carries (defaults to the live one). */
  heldVersion?: string
  /** Holds in a row the restored cache already carries. */
  heldCount?: number
  fetchCache?: number
}

function fixture(t: Tree): string {
  const root = mkdtempSync(path.join(tmpdir(), 'cache-hold-'))
  temps.push(root)
  const cache = path.join(root, '.next', 'cache')
  sparse(path.join(cache, 'turbopack', VERSION, '00000009.sst'), TRIM_RAW * t.live)
  writeFileSync(path.join(cache, 'turbopack', VERSION, 'CURRENT'), 'live')
  if (t.held !== undefined) {
    const v = t.heldVersion ?? VERSION
    sparse(path.join(cache, HELD_DIR, v, '00000001.sst'), TRIM_RAW * t.held)
    writeFileSync(path.join(cache, HELD_DIR, v, 'CURRENT'), 'restored')
  }
  if (t.heldCount !== undefined) {
    writeFileSync(path.join(cache, HELD_STATE_FILE), JSON.stringify({ held: t.heldCount }))
  }
  if (t.fetchCache !== undefined) sparse(path.join(cache, 'fetch-cache', 'blob.bin'), TRIM_RAW * t.fetchCache)
  return root
}

function run(root: string, file = GATE, src?: string): { status: number; out: string } {
  let target = file
  if (src !== undefined) {
    const dir = mkdtempSync(path.join(tmpdir(), 'cache-hold-mutant-'))
    temps.push(dir)
    target = path.join(dir, 'mutant.mjs')
    writeFileSync(target, src)
  }
  const res = spawnSync(process.execPath, [target], { cwd: root, encoding: 'utf8' })
  return { status: res.status ?? -1, out: `${res.stdout ?? ''}${res.stderr ?? ''}` }
}

const at = (root: string, ...p: string[]) => path.join(root, '.next', 'cache', ...p)
const liveMarker = (root: string) => readFileSync(at(root, 'turbopack', VERSION, 'CURRENT'), 'utf8')
const heldState = (root: string) =>
  existsSync(at(root, HELD_STATE_FILE)) ? JSON.parse(readFileSync(at(root, HELD_STATE_FILE), 'utf8')).held : 0

describe('an over-budget build keeps the generation it restored instead of trimming', () => {
  it('puts the restored cache back, drops this build’s, and counts the hold', () => {
    const root = fixture({ live: 1.2, held: 0.8, fetchCache: 0.05 })
    const { status, out } = run(root)

    expect(out, 'the fixture did not cross the trim point, so this case proves nothing').toContain('HELD the compiler cache')
    expect(liveMarker(root), 'the cache Vercel will store is still the one this build wrote').toBe('restored')
    expect(existsSync(at(root, HELD_DIR)), 'the snapshot would be uploaded as a second copy').toBe(false)
    expect(heldState(root)).toBe(1)
    expect(existsSync(at(root, 'fetch-cache')), 'the hold must touch nothing but the compiler cache').toBe(true)
    expect(out).not.toContain('trimmed the build cache')
    expect(status).toBe(0)
  })

  it('carries the count forward and still holds below HOLD_LIMIT', () => {
    const root = fixture({ live: 1.2, held: 0.8, heldCount: HOLD_LIMIT - 1 })
    const { out } = run(root)
    expect(out).toContain('HELD the compiler cache')
    expect(heldState(root)).toBe(HOLD_LIMIT)
  })

  it('trims at HOLD_LIMIT so the next build compiles a fresh cache, and resets the count', () => {
    const root = fixture({ live: 1.2, held: 0.8, heldCount: HOLD_LIMIT })
    const { status, out } = run(root)
    expect(out).toContain('trimmed the build cache')
    expect(out).toContain('HOLD_LIMIT')
    expect(existsSync(at(root, 'turbopack')), 'a refresh must drop the frozen generation').toBe(false)
    expect(existsSync(at(root, HELD_DIR))).toBe(false)
    expect(heldState(root)).toBe(0)
    expect(status).toBe(0)
  })
})

describe('the hold is refused, and the trim runs as before, when the restored cache cannot help', () => {
  it('with no snapshot (a cold build)', () => {
    const root = fixture({ live: 1.2 })
    const { out } = run(root)
    expect(out).toContain('trimmed the build cache')
    expect(out).toContain('no restored generation was snapshotted')
    expect(existsSync(at(root, 'turbopack'))).toBe(false)
  })

  it('when the snapshot is from another compiler version (a Next upgrade)', () => {
    const root = fixture({ live: 1.2, held: 0.8, heldVersion: 'v16.3.5-00000000' })
    const { out } = run(root)
    expect(out).toContain('trimmed the build cache')
    expect(out).toContain('cold cache anyway')
    expect(existsSync(at(root, 'turbopack'))).toBe(false)
    expect(existsSync(at(root, HELD_DIR))).toBe(false)
  })

  it('when the restored cache is itself over the trim point', () => {
    const root = fixture({ live: 1.3, held: 1.1 })
    const { out } = run(root)
    expect(out).toContain('trimmed the build cache')
    expect(out).toContain('over the trim point too')
    expect(existsSync(at(root, 'turbopack'))).toBe(false)
  })
})

describe('the snapshot is never weighed as cache and never uploaded', () => {
  it('does not count the snapshot toward the trim point, and keeps a cache that fits without it', () => {
    // 0.7 + 0.6 is over the trim point only if the snapshot is counted. It is links to the same
    // bytes on a real build, so counting it would trim a cache that fits.
    const root = fixture({ live: 0.7, held: 0.6, heldCount: 3 })
    const { status, out } = run(root)
    expect(out).not.toContain('trimmed the build cache')
    expect(out).not.toContain('HELD the compiler cache')
    expect(liveMarker(root), 'a cache that fits is this build’s own, freshest one').toBe('live')
    expect(existsSync(at(root, HELD_DIR)), 'the snapshot would be uploaded as a second copy').toBe(false)
    expect(heldState(root), 'a build that fits resets the run of holds').toBe(0)
    expect(out).not.toContain(HELD_DIR)
    expect(status).toBe(0)
  })
})

describe('the hold can delete only its own scratch (LIVE-048)', () => {
  it('turns itself off, and deletes nothing protected, if HOLD_ARTIFACTS ever names the fetch cache', () => {
    const mutant = SRC.replace(
      "const HOLD_ARTIFACTS = [HELD_DIR, 'turbopack-discarded', HELD_STATE_FILE]",
      "const HOLD_ARTIFACTS = [HELD_DIR, 'turbopack-discarded', HELD_STATE_FILE, 'fetch-cache']",
    )
    expect(mutant, 'HOLD_ARTIFACTS changed shape; re-point this mutation').not.toBe(SRC)
    const root = fixture({ live: 1.2, held: 0.8, fetchCache: 0.05 })
    const { status, out } = run(root, GATE, mutant)
    expect(out).toContain('so the hold is off')
    expect(existsSync(at(root, 'fetch-cache')), 'THE 2026-08-18 DEFECT, by a new door').toBe(true)
    expect(existsSync(at(root, HELD_DIR)), 'the snapshot must still be tidied away').toBe(false)
    expect(status).toBe(0)
  })

  it('routes every delete of its scratch through the one guarded helper', () => {
    const code = SRC.split('\n')
      .filter((l) => !/^\s*(\/\/|\*)/.test(l))
      .join('\n')
    const deletes = code.match(/rmSync\(/g) ?? []
    // The pnpm-orphan prune, the trim loop, and dropHoldArtifact(). Nothing else.
    expect(deletes.length).toBe(3)
    expect(code).toMatch(/function dropHoldArtifact\(name\) \{\n\s+if \(!HOLD_ARTIFACTS\.includes\(name\)/)
  })
})

describe('the assertions above can actually fail', () => {
  it('with the hold disabled, the same over-budget tree loses its compiler cache', () => {
    const mutant = SRC.replace('const verdict = holdVerdict()', "const verdict = { ok: false, reason: 'mutant' }")
    expect(mutant, 'the hold call changed shape; re-point this mutation').not.toBe(SRC)
    const root = fixture({ live: 1.2, held: 0.8 })
    const { out } = run(root, GATE, mutant)
    expect(out).toContain('trimmed the build cache')
    expect(existsSync(at(root, 'turbopack'))).toBe(false)
  })

  it('with the snapshot counted as cache, a tree that fits is trimmed', () => {
    const mutant = SRC.replace("let nextCache = measure('.next/cache') - heldRaw", "let nextCache = measure('.next/cache')")
    expect(mutant, 'the measurement line changed shape; re-point this mutation').not.toBe(SRC)
    const root = fixture({ live: 0.7, held: 0.6 })
    const { out } = run(root, GATE, mutant)
    expect(out).toMatch(/trimmed the build cache|HELD the compiler cache/)
  })
})

describe('prebuild takes the snapshot the gate holds', () => {
  function restored(): string {
    const root = mkdtempSync(path.join(tmpdir(), 'cache-snap-'))
    temps.push(root)
    const v = path.join(root, '.next', 'cache', 'turbopack', VERSION)
    mkdirSync(v, { recursive: true })
    writeFileSync(path.join(v, '00000001.sst'), 'table')
    writeFileSync(path.join(v, '00000002.meta'), 'index')
    writeFileSync(path.join(v, 'CURRENT'), 'current')
    writeFileSync(path.join(v, 'LOG'), 'log')
    return root
  }

  it('links the write-once tables and copies the files Turbopack rewrites in place', () => {
    const root = restored()
    const { status, out } = run(root, SNAPSHOT)
    expect(status).toBe(0)
    expect(out).toContain('linked the restored Turbopack cache')
    const inode = (...p: string[]) => statSync(at(root, ...p)).ino
    expect(inode(HELD_DIR, VERSION, '00000001.sst')).toBe(inode('turbopack', VERSION, '00000001.sst'))
    expect(inode(HELD_DIR, VERSION, '00000002.meta')).toBe(inode('turbopack', VERSION, '00000002.meta'))
    // A linked CURRENT or LOG would carry this build's rewrite back into the held generation.
    expect(inode(HELD_DIR, VERSION, 'CURRENT')).not.toBe(inode('turbopack', VERSION, 'CURRENT'))
    expect(inode(HELD_DIR, VERSION, 'LOG')).not.toBe(inode('turbopack', VERSION, 'LOG'))
    expect(readFileSync(at(root, HELD_DIR, VERSION, 'CURRENT'), 'utf8')).toBe('current')
  })

  it('replaces a stale snapshot rather than reusing it', () => {
    const root = restored()
    sparse(at(root, HELD_DIR, 'v0-stale', 'old.sst'), 10)
    run(root, SNAPSHOT)
    expect(existsSync(at(root, HELD_DIR, 'v0-stale'))).toBe(false)
    expect(existsSync(at(root, HELD_DIR, VERSION, '00000001.sst'))).toBe(true)
  })

  it('takes no snapshot on a cold build, and exits 0', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'cache-snap-cold-'))
    temps.push(root)
    const { status, out } = run(root, SNAPSHOT)
    expect(status).toBe(0)
    expect(out).toContain('compiles cold')
    expect(existsSync(at(root, HELD_DIR))).toBe(false)
  })

  it('abandons a snapshot it cannot take whole, and still exits 0', () => {
    const root = restored()
    symlinkSync('00000001.sst', at(root, 'turbopack', VERSION, 'alias.sst'))
    const { status, out } = run(root, SNAPSHOT)
    expect(status, 'a snapshot problem must never fail a build').toBe(0)
    expect(out).toContain('no snapshot this build')
    expect(existsSync(at(root, HELD_DIR)), 'a partial snapshot would be a database with a hole in it').toBe(false)
  })
})

describe('wiring', () => {
  it('both files name the same snapshot directory', () => {
    expect(stringConstant(SNAP_SRC, 'HELD_DIR')).toBe(HELD_DIR)
  })

  it('prebuild takes the snapshot and postbuild still runs the gate that uses it', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }
    expect(pkg.scripts.prebuild).toContain('snapshot-turbopack-cache.mjs')
    expect(pkg.scripts.postbuild).toContain('check-cache-budget.mjs')
  })
})
