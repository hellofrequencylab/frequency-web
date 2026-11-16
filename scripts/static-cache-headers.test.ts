import { describe, it, expect, beforeAll } from 'vitest'
import { createRequire } from 'node:module'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

// SCAN-1213: the Cache-Control each path is actually served from next.config.ts, read the way the
// router reads it (same loader as scripts/permissions-policy.test.ts). Three of the cached folders
// share a name with a page route: /themes/nocturne, /sites/[slug] and /create-a-space are HTML. A
// rule written as `/themes/:path*` would give those pages a week in the browser cache, and a
// stale page for a week is a far worse bug than an image that revalidates. So this pins both
// halves: every file in the folders is cached, and no page beside them is.

const require = createRequire(import.meta.url)

type Header = { key: string; value: string }
let routes: { headers: Header[]; re: RegExp }[] = []

beforeAll(async () => {
  const loadConfig = require('next/dist/server/config').default
  const loadCustomRoutes = require('next/dist/lib/load-custom-routes').default
  const { buildCustomRoute } = require('next/dist/lib/build-custom-route')
  const config = await loadConfig('phase-production-server', process.cwd(), { silent: true })
  const { headers } = await loadCustomRoutes(config)
  routes = headers.map((h: { source: string; headers: Header[] }) => ({
    headers: h.headers,
    re: new RegExp(buildCustomRoute('header', h).regex, 'i'),
  }))
}, 60_000)

function cacheControlFor(path: string): string[] {
  return routes
    .filter((r) => r.re.test(path))
    .flatMap((r) => r.headers.filter((h) => h.key.toLowerCase() === 'cache-control').map((h) => h.value))
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? filesUnder(join(dir, e.name)) : [join(dir, e.name)],
  )
}

const WEEK = 'public, max-age=604800, stale-while-revalidate=86400'
const CACHED_FOLDERS = ['themes', 'sites', 'themes-index', 'create-a-space', 'screenshots']

// Pages that live at or under the same first segment as a cached folder.
const PAGES = [
  '/themes',
  '/themes/nocturne',
  '/themes/nocturne/demo',
  '/themes/designer',
  '/sites/alli-rae',
  '/sites/alli-rae/about',
  '/create-a-space',
  '/create-a-space?kit=temple',
  '/',
  '/feed',
  '/pricing',
]

describe('Cache-Control on public art (SCAN-1213)', () => {
  it.each(CACHED_FOLDERS)('every file in public/%s is served the week header, once', (folder) => {
    const urls = filesUnder(join('public', folder)).map((f) => '/' + f.split('\\').join('/').slice('public/'.length))
    expect(urls.length).toBeGreaterThan(0)
    const wrong = urls.filter((u) => {
      const got = cacheControlFor(encodeURI(u))
      return got.length !== 1 || got[0] !== WEEK
    })
    expect(wrong).toEqual([])
  })

  it.each(PAGES)('%s is a page and gets no Cache-Control from the config', (path) => {
    expect(cacheControlFor(path.split('?')[0])).toEqual([])
  })

  it('the map worker is left to revalidate, because it changes in place on a maplibre-gl bump', () => {
    expect(cacheControlFor('/maplibre/maplibre-gl-worker.mjs')).toEqual([])
    expect(cacheControlFor('/maplibre/maplibre-gl-shared.mjs')).toEqual([])
  })
})
