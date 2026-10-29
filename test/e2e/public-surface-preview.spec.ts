// Preview counterpart of the production public-surface checks. Exact production-only
// hostname, permanent redirect, cache, and live-site contracts stay in the existing suite.
import { test, expect } from './fixtures'
import {
  BANNED_MACHINE_COPY,
  blockedByRobots,
  canonicalHref,
  jsonLdBlocks,
  metaContent,
  pageTitle,
  robotsDisallows,
  robotsSitemaps,
  sitemapLocs,
} from './public-surface'

const baseURL = process.env.PW_BASE_URL
// Request-only checks do not vary by viewport: run them once, under the mobile-emulating projects only.
const onlyOnce = ({ isMobile }: { isMobile: boolean }) => !isMobile

test.describe('preview public surface', { tag: '@preview-surface' }, () => {
  test.skip(!baseURL, 'PW_BASE_URL is not set.')
  test.skip(onlyOnce, 'viewport-independent: runs under mobile only')

  test('robots.txt blocks private areas, keeps / open, names an absolute sitemap', async ({ request }) => {
    const res = await request.get('/robots.txt')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('text/plain')
    const body = await res.text()
    const rules = robotsDisallows(body)
    for (const p of ['/api/', '/admin', '/messages', '/settings']) expect(rules, p).toContain(p)
    expect(rules, 'never disallow the whole site').not.toContain('/')
    const maps = robotsSitemaps(body)
    expect(maps.length).toBeGreaterThan(0)
    for (const m of maps) expect(m).toMatch(/^https:\/\//)
  })

  test('sitemap.xml is well formed, absolute, same host, unique, and avoids robots-blocked paths', async ({ request }) => {
    const robots = await (await request.get('/robots.txt')).text()
    const rules = robotsDisallows(robots)
    const res = await request.get('/sitemap.xml')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toMatch(/xml/)
    const locs = sitemapLocs(await res.text())
    expect(locs.length).toBeGreaterThan(10)
    expect(new Set(locs).size, 'duplicate <loc>').toBe(locs.length)
    const host = new URL(robotsSitemaps(robots)[0]).host
    const blocked: string[] = []
    for (const loc of locs) {
      const u = new URL(loc)
      expect(u.host, loc).toBe(host)
      const hit = blockedByRobots(u.pathname, rules)
      if (hit) blocked.push(`${u.pathname} (${hit})`)
    }
    expect(blocked, 'sitemap lists URLs robots.txt disallows').toEqual([])
  })

  test('a sample of sitemap URLs answer 2xx without server errors', async ({ request }) => {
    const locs = sitemapLocs(await (await request.get('/sitemap.xml')).text())
    const step = Math.max(1, Math.floor(locs.length / 12))
    const sample = locs.filter((_, i) => i % step === 0).slice(0, 12)
    for (const loc of sample) {
      const res = await request.get(new URL(loc).pathname, { maxRedirects: 0 })
      expect(res.status(), loc).toBeLessThan(400)
    }
  })

  for (const path of ['/llms.txt', '/llms-full.txt']) {
    test(`${path} is text, non-empty, free of banned copy`, async ({ request }) => {
      const res = await request.get(path)
      expect(res.status()).toBe(200)
      expect(res.headers()['content-type']).toContain('text/')
      const body = await res.text()
      expect(body.trim().length).toBeGreaterThan(200)
      for (const re of BANNED_MACHINE_COPY) expect(body).not.toMatch(re)
    })
  }

  test('/api/status is JSON and carries build identity', async ({ request }) => {
    const res = await request.get('/api/status')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('application/json')
    const json = await res.json()
    expect(json.service).toBe('frequency')
    expect(json.build).toBeTruthy()
  })

  test('unknown API paths and anonymous private APIs never 5xx and answer JSON-or-empty', async ({ request }) => {
    for (const path of ['/api/qa-probe-does-not-exist', '/api/v1/qa-probe-does-not-exist', '/api/v1/me', '/api/v1/messages', '/api/v1/notifications']) {
      const res = await request.get(path, { maxRedirects: 0 })
      expect(res.status(), path).toBeLessThan(500)
      expect([200, 301, 302, 307, 308, 400, 401, 403, 404, 405], path).toContain(res.status())
      const ct = res.headers()['content-type'] ?? ''
      if (res.status() >= 400 && ct.includes('json')) {
        const body = await res.json()
        expect(typeof body, `${path} error body`).toBe('object')
      }
    }
  })

  test('/themes/midnight and its demo resolve to nocturne', async ({ request }) => {
    for (const [from, to] of [['/themes/midnight', '/themes/nocturne'], ['/themes/midnight/demo', '/themes/nocturne/demo']]) {
      const res = await request.get(from)
      expect(res.status(), from).toBe(200)
      expect(new URL(res.url()).pathname, from).toBe(to)
    }
  })

  test('unknown pages are a real 404 with noindex, not a soft 200', async ({ request }) => {
    for (const path of ['/qa-probe-does-not-exist', '/themes/qa-probe-does-not-exist', '/for/qa-probe-does-not-exist']) {
      const res = await request.get(path)
      expect(res.status(), path).toBe(404)
      const html = await res.text()
      expect(metaContent(html, 'name', 'robots'), path).toContain('noindex')
    }
  })

  test('home and key marketing pages carry title, self canonical, og:title and valid JSON-LD', async ({ request }) => {
    for (const path of ['/', '/themes/nocturne', '/pricing']) {
      const res = await request.get(path)
      expect(res.status(), path).toBe(200)
      const html = await res.text()
      expect(pageTitle(html), `${path} title`).toBeTruthy()
      expect(metaContent(html, 'property', 'og:title'), `${path} og:title`).toBeTruthy()
      expect(metaContent(html, 'name', 'robots') ?? 'index', `${path} robots`).not.toMatch(/noindex/)
      const canon = canonicalHref(html)
      expect(canon, `${path} canonical`).toBeTruthy()
      expect(new URL(canon!).pathname, `${path} canonical path`).toBe(path)
      for (const b of jsonLdBlocks(html)) expect(b.error, `${path} JSON-LD`).toBeUndefined()
    }
  })

  test('MapLibre worker is served as JavaScript from /maplibre/, and its sibling resolves', async ({ request }) => {
    const worker = await request.get('/maplibre/maplibre-gl-worker.mjs')
    expect(worker.status()).toBe(200)
    expect(worker.headers()['content-type'] ?? '').toMatch(/javascript/)
    expect((await worker.body()).length, 'worker is not an empty or error body').toBeGreaterThan(100_000)
    // maplibre-gl ships this sibling as a 0-byte file; what matters is that the worker's
    // `./maplibre-gl-shared.mjs` import resolves (200) rather than 404ing into a blank map.
    const shared = await request.get('/maplibre/maplibre-gl-shared.mjs')
    expect(shared.status()).toBe(200)
  })


})
