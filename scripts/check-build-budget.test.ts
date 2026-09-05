import { describe, it, expect, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { closeSync, ftruncateSync, mkdirSync, mkdtempSync, openSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// The deploy disk budget (ADR-1003), proven to FAIL as well as to pass (scan2 L8-02).
//
// This gate runs in `postbuild` on Vercel against the real `.next/server` and nothing else ever
// executed it. Its vacuous shape is specific: `sizeOf` returns 0 for any path it cannot stat, so a
// trace layout whose `files` no longer resolve reads as "0.00 GB across N functions, under the
// budget" and exits 0. That is the 2026-08-11 incident with a green light on it. This file builds a
// fake `.next/server` whose traces point at ONE sparse file (so a 40 MB x 220 = 8.6 GB fan-out
// costs 40 MB of disk), spawns the real script from there, and asserts each arm fires.
//
// The fixture is never needed at runtime: postbuild still reads the real artifact.

const ROOT = process.cwd()
const GUARD = path.join(ROOT, 'scripts/check-build-budget.mjs')
const MB = 1024 ** 2

const fixtures: string[] = []
afterAll(() => {
  for (const d of fixtures) rmSync(d, { recursive: true, force: true })
})

/** A sparse file: the size the gate will stat, none of the disk. */
function sparse(p: string, bytes: number) {
  mkdirSync(path.dirname(p), { recursive: true })
  const fd = openSync(p, 'w')
  ftruncateSync(fd, bytes)
  closeSync(fd)
}

/** `functions` traces under app/<n>/page.js.nft.json, each carrying the shared chunk plus its
 *  own small module. `chunkMb` is the shared file's size; `resolvable: false` points every trace
 *  at a path that does not exist, which is the zero-reading case. */
function makeArtifact({ functions = 220, chunkMb = 10, resolvable = true }: { functions?: number; chunkMb?: number; resolvable?: boolean } = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'build-budget-'))
  fixtures.push(dir)
  const server = path.join(dir, '.next/server')
  if (resolvable) sparse(path.join(server, 'chunks/shared.js'), chunkMb * MB)
  for (let i = 0; i < functions; i++) {
    const fnDir = path.join(server, `app/route-${i}`)
    mkdirSync(fnDir, { recursive: true })
    sparse(path.join(fnDir, 'page.js'), 4096)
    // A file listed twice in one trace counts once per function.
    const files = resolvable ? ['./page.js', '../../chunks/shared.js', '../../chunks/shared.js'] : ['./missing.js', '../../chunks/missing.js']
    writeFileSync(path.join(fnDir, 'page.js.nft.json'), JSON.stringify({ version: 1, files }))
  }
  return dir
}

function run(dir: string) {
  const res = spawnSync(process.execPath, [GUARD], { cwd: dir, encoding: 'utf8' })
  return { code: res.status ?? -1, out: `${res.stdout}\n${res.stderr}` }
}

describe('check-build-budget · the clean case is a real pass', () => {
  it('sums the per-function fan-out, not the unique set, and names the largest cost', () => {
    // 220 x (10 MB + 4 KB) = 2.15 GB; the unique set is 10 MB. The gate must report the former.
    const { code, out } = run(makeArtifact())
    expect(code, out).toBe(0)
    expect(out).toMatch(/2\.1\d GB across 220 functions, under the 8 GB budget/)
    expect(out).toContain('10.0 MB x 220 fns')
    expect(out).toContain('chunks/shared.js')
  })
})

describe('check-build-budget · the planted breach', () => {
  it('a fan-out over the budget fails and prints the file that caused it', () => {
    // 220 x 40 MB = 8.59 GB.
    const { code, out } = run(makeArtifact({ chunkMb: 40 }))
    expect(code).toBe(1)
    expect(out).toMatch(/would write 8\.\d\d GB across 220 functions, over the 8 GB budget/)
    expect(out).toContain('40.0 MB x  220 fns')
    expect(out).toContain('chunks/shared.js')
  })
})

describe('check-build-budget · the non-triviality floors', () => {
  it('traces whose files do not resolve read as 0 GB, and 0 GB is "saw nothing" (exit 2), not a pass', () => {
    const { code, out } = run(makeArtifact({ resolvable: false }))
    expect(code).toBe(2)
    expect(out).toContain('0.00 GB (floor 1 GB)')
    expect(out).toContain('saw nothing it can vouch for')
  })

  it('too few functions is exit 2 as well, even when the bytes are real', () => {
    const { code, out } = run(makeArtifact({ functions: 30, chunkMb: 60 }))
    expect(code).toBe(2)
    expect(out).toContain('30 function(s) (floor 200)')
  })

  it('no trace files at all is a failure, not a pass', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'build-budget-'))
    fixtures.push(dir)
    mkdirSync(path.join(dir, '.next/server/app'), { recursive: true })
    const { code, out } = run(dir)
    expect(code).not.toBe(0)
    expect(out).toContain('holds no trace files')
  })
})
