// HYG-245 / ADR-1975: next.config.ts strips sharp (and libvips behind it) from every function
// that is not a share card, with one path-shaped negation key in outputFileTracingExcludes.
//
// Next matches that key with its own compiled picomatch in `contains` mode against the route
// string normalizeAppPath makes from each entry (next/dist/build/collect-build-traces.js). This
// runs the same two functions over every real route in app/, so a key that drifts in either
// direction fails here, before a build: one that strips a card leaves it serving 1.7 MB PNGs
// (check:og-trace also catches that, but only after a full build), one that strips nothing puts
// ~410 MB back into the deploy with a green board.
import { describe, it, expect } from 'vitest'
import { readFileSync, globSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { normalizeAppPath } from 'next/dist/shared/lib/router/utils/app-paths'

// Next's own compiled copy, the one collect-build-traces uses. It ships no type declarations.
type Matcher = (glob: string | string[], opts: { dot: boolean; contains: boolean }) => (s: string) => boolean
const picomatch = createRequire(import.meta.url)('next/dist/compiled/picomatch') as Matcher

const ROOT = join(__dirname, '..')
const config = readFileSync(join(ROOT, 'next.config.ts'), 'utf8')
const KEY = config.match(/'(!\*\*\/@\(opengraph-image\|twitter-image\)\*)'\s*:\s*\[([^\]]*)\]/)

/** The entry names Next builds: page/route files, plus each dynamic card as a hashed route. */
function routes(): { route: string; card: boolean }[] {
  const pages = globSync('app/**/{page,route}.{ts,tsx,js,mdx}', { cwd: ROOT }).map((f) => ({
    entry: f.replace(/\.(tsx?|js|mdx)$/, ''),
    card: /\/(opengraph-image|twitter-image)\/route$/.test(f.replace(/\.(tsx?|js)$/, '')),
  }))
  const cards = globSync('app/**/{opengraph-image,twitter-image}.tsx', { cwd: ROOT }).map((f) => ({
    entry: f.replace(/\.tsx$/, '-abc123/route'),
    card: true,
  }))
  return [...pages, ...cards].map(({ entry, card }) => ({ route: normalizeAppPath(entry), card }))
}

describe('sharp is excluded from every function except the share cards', () => {
  it('the key and its sharp globs are in next.config.ts', () => {
    expect(KEY).not.toBeNull()
    expect(KEY![2]).toContain("'./node_modules/**/node_modules/@img/**'")
    expect(KEY![2]).toContain("'./node_modules/**/node_modules/sharp/**'")
  })

  it('reads a real route tree (guards a vacuous pass)', () => {
    const all = routes()
    expect(all.length).toBeGreaterThan(400)
    expect(all.filter((r) => r.card).length).toBeGreaterThanOrEqual(20)
  })

  it('keeps sharp on every card route and strips it from every other route', () => {
    const isMatch = picomatch(KEY![1], { dot: true, contains: true })
    const wrong = routes().filter(({ route, card }) => isMatch(route) === card)
    expect(wrong.map((r) => r.route)).toEqual([])
  })

  it('matches the help group card, whose route sits at the app root with a hash suffix', () => {
    const isMatch = picomatch(KEY![1], { dot: true, contains: true })
    expect(isMatch('/app/opengraph-image-12g5h9')).toBe(false)
    expect(isMatch('/app/spaces/[slug]')).toBe(true)
  })

  it('strips the excluded files and nothing else', () => {
    const globs = ['./node_modules/sharp/**', './node_modules/@img/**', './node_modules/**/node_modules/sharp/**', './node_modules/**/node_modules/@img/**'].map((g) => join('/vercel/path0', g))
    const isMatch = picomatch(globs, { dot: true, contains: true })
    const at = (f: string) => join('/vercel/path0/.next/server/app/x', '../../../../', f)
    expect(isMatch(at('node_modules/.pnpm/@img+sharp-libvips-linux-x64@1.3.4/node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.18.7'))).toBe(true)
    expect(isMatch(at('node_modules/.pnpm/sharp@0.35.5/node_modules/sharp/lib/index.js'))).toBe(true)
    expect(isMatch(at('node_modules/.pnpm/next@16.4.6/node_modules/next/dist/server/next-server.js'))).toBe(false)
    expect(isMatch(at('node_modules/.pnpm/detect-libc@2.0.4/node_modules/detect-libc/lib/detect-libc.js'))).toBe(false)
  })
})
