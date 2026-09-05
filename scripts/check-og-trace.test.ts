import { describe, it, expect, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// The sharp fan-out gate (ADR-1002), proven to FAIL as well as to pass (scan2 L8-02).
//
// This gate runs in `postbuild` on Vercel against the real `.next/server` and nothing else ever
// executed it, so a renamed trace layout or a RASTERISING pattern that stopped matching the route
// path would have printed "sharp ships to all 0 rasterising route(s)" and exited 0. That exact
// vacuity already happened once (the header of the script records it). This file builds a fake
// `.next/server` in a temp dir, spawns the real script from there, and asserts each arm fires:
// a starved card, a spread card, and the new floor on an artifact too small to vouch for.
//
// The fixture is never needed at runtime: postbuild still reads the real artifact.

const ROOT = process.cwd()
const GUARD = path.join(ROOT, 'scripts/check-og-trace.mjs')

const LIBVIPS = '../../../../node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.42'
const PLAIN = ['../../../chunks/1234.js', '../../../../node_modules/next/dist/server/app-render.js']

type Options = {
  plain?: number
  rasterisers?: number
  incidental?: number
  starved?: number
  ext?: string
}

const fixtures: string[] = []
afterAll(() => {
  for (const d of fixtures) rmSync(d, { recursive: true, force: true })
})

/** A fake `.next/server`: `plain` functions carrying no sharp, `rasterisers` card routes carrying
 *  it, `incidental` ordinary pages carrying it by inheritance, `starved` card routes without it. */
function makeArtifact({ plain = 220, rasterisers = 6, incidental = 10, starved = 0, ext = '.nft.json' }: Options = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'og-trace-'))
  fixtures.push(dir)
  const server = path.join(dir, '.next/server')
  const trace = (rel: string, files: string[]) => {
    const p = path.join(server, rel)
    mkdirSync(path.dirname(p), { recursive: true })
    writeFileSync(p, JSON.stringify({ version: 1, files }))
  }
  for (let i = 0; i < plain; i++) trace(`app/plain-${i}/page.js${ext}`, PLAIN)
  for (let i = 0; i < rasterisers; i++) trace(`app/discover/kind-${i}/[slug]/opengraph-image/route.js${ext}`, [...PLAIN, LIBVIPS])
  for (let i = 0; i < starved; i++) trace(`app/starved-${i}/[slug]/twitter-image/route.js${ext}`, PLAIN)
  for (let i = 0; i < incidental; i++) trace(`app/(main)/spaces/[slug]/inherit-${i}/page.js${ext}`, [...PLAIN, LIBVIPS])
  // A static card being SERVED, not drawn: it must not be asked for a rasteriser.
  trace(`app/opengraph-image.jpg/route.js${ext}`, PLAIN)
  return dir
}

function run(dir: string) {
  const res = spawnSync(process.execPath, [GUARD], { cwd: dir, encoding: 'utf8', env: { ...process.env, VERCEL: '1' } })
  return { code: res.status ?? -1, out: `${res.stdout}\n${res.stderr}` }
}

describe('check-og-trace · the clean case is a real pass', () => {
  it('exits 0 and counts the rasterisers, the incidental carriers, and the rest', () => {
    const { code, out } = run(makeArtifact())
    expect(code, out).toBe(0)
    expect(out).toContain('sharp ships to all 6 rasterising route(s), and to 10 other function(s)')
    // 220 plain + 1 static jpg route carry none of it.
    expect(out).toContain('221 functions carry none of it')
  })
})

describe('check-og-trace · one planted violation per arm', () => {
  it('a card route that ships WITHOUT sharp fails and is named by route', () => {
    const { code, out } = run(makeArtifact({ starved: 1 }))
    expect(code).toBe(1)
    expect(out).toContain('1 card-rasterising route(s) ship WITHOUT sharp')
    expect(out).toContain('/app/starved-0/[slug]/twitter-image')
  })

  it('sharp spreading past the incidental budget fails and names the heaviest segment', () => {
    const { code, out } = run(makeArtifact({ incidental: 101 }))
    expect(code).toBe(1)
    expect(out).toContain('sharp reached 101 function(s) that never rasterise a card (budget 100)')
    expect(out).toContain('101 function(s) under /app/(main)')
  })

  it('exactly at the budget still passes: the ceiling is inclusive', () => {
    const { code, out } = run(makeArtifact({ incidental: 100 }))
    expect(code, out).toBe(0)
    expect(out).toContain('only 0 function(s) of headroom')
  })
})

describe('check-og-trace · the non-triviality floors', () => {
  it('an artifact with NO rasterising route is "saw nothing" (exit 2), never "all 0 ship sharp"', () => {
    // The vacuous pass this file exists for: every trace read, the RASTERISING pattern matched
    // nothing, and before the floor the script printed a clean verdict about zero routes.
    const { code, out } = run(makeArtifact({ rasterisers: 0, incidental: 0 }))
    expect(code).toBe(2)
    expect(out).toContain('0 rasterising route(s) (floor 5)')
    expect(out).toContain('saw nothing it can vouch for')
  })

  it('a partial trace layout (too few functions) is exit 2 as well', () => {
    const { code, out } = run(makeArtifact({ plain: 20 }))
    expect(code).toBe(2)
    expect(out).toMatch(/\d+ trace file\(s\) \(floor 200\)/)
  })

  it('a renamed trace layout is a failure, not a pass', () => {
    const { code, out } = run(makeArtifact({ ext: '.trace.json' }))
    expect(code).not.toBe(0)
    expect(out).toContain('holds no trace files')
  })

  it('no .next/server at all is a failure, not a pass', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'og-trace-'))
    fixtures.push(dir)
    const { code, out } = run(dir)
    expect(code).not.toBe(0)
    expect(out).toContain('no .next/server')
  })
})
