// HYG-245 / ADR-1975: next.config.ts strips sharp (and libvips behind it) from every PAGE
// function with one outputFileTracingExcludes key, '/app/**/page'.
//
// This build uses Turbopack, so the key is applied by next-api/src/nft.rs, not by
// collect-build-traces.js: Turbopack's own glob in `contains` mode (no `!` negation, no extglob)
// against the route `/app` + the entry's original name, groups and the trailing `/page` or
// `/route` kept. This test models that over every real route in app/, so a key that drifts in
// either direction fails here, before a build: one that reaches a card route leaves it serving
// 1.7 MB PNGs (check:og-trace also catches that, but only after a full build), one that misses
// the pages puts ~410 MB back into the deploy with a green board.
import { describe, it, expect } from 'vitest'
import { readFileSync, globSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const config = readFileSync(join(ROOT, 'next.config.ts'), 'utf8')
const ENTRY = config.match(/'(\/app\/\*\*\/page)'\s*:\s*\[([^\]]*)\]/)

/** Turbopack's contains-mode reading of `/app/**\/page`: an unanchored `/app/(.../)?page`. */
const turbopackMatches = (route: string) => /\/app\/(?:.*\/)?page/.test(route)

/** The route string nft.rs builds: '/app' + original name, e.g. /app/(public)/spaces/[slug]/page. */
function routes(): { route: string; card: boolean }[] {
  const handlers = globSync('app/**/{page,route}.{ts,tsx,js,mdx}', { cwd: ROOT }).map((f) => {
    const entry = '/' + f.replace(/\.(tsx?|js|mdx)$/, '')
    return { route: entry, card: /\/(opengraph-image|twitter-image)[^/]*\/route$/.test(entry) }
  })
  // A file-convention card is emitted as a route handler with a hashed suffix.
  const cards = globSync('app/**/{opengraph-image,twitter-image}.tsx', { cwd: ROOT }).map((f) => ({
    route: '/' + f.replace(/\.tsx$/, '-abc123/route'),
    card: true,
  }))
  return [...handlers, ...cards]
}

describe('sharp is excluded from every page and kept on every share card', () => {
  it('the key and its sharp globs are in next.config.ts', () => {
    expect(ENTRY).not.toBeNull()
    expect(ENTRY![2]).toContain("'./node_modules/**/node_modules/@img/**'")
    expect(ENTRY![2]).toContain("'./node_modules/**/node_modules/sharp/**'")
  })

  it('reads a real route tree (guards a vacuous pass)', () => {
    const all = routes()
    expect(all.length).toBeGreaterThan(400)
    expect(all.filter((r) => r.card).length).toBeGreaterThanOrEqual(20)
  })

  it('reaches no card route', () => {
    const hit = routes().filter((r) => r.card && turbopackMatches(r.route))
    expect(hit.map((r) => r.route)).toEqual([])
  })

  it('reaches every page that shares a segment with a card', () => {
    for (const page of [
      '/app/(public)/spaces/[slug]/page',
      '/app/(help)/help/[category]/[slug]/page',
      '/app/discover/circles/[id]/page',
      '/app/spotlight/[handle]/page',
    ]) {
      expect(routes().some((r) => r.route === page)).toBe(true)
      expect(turbopackMatches(page)).toBe(true)
    }
  })
})
