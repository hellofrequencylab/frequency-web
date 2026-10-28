// Anonymous production-surface QA: robots, sitemap, llms.txt, status API, redirects, 404s, head
// tags and structured data on the platform host and on live Space sites. Request-only (no
// browser), no auth, no cookies sent, read-only GETs.
//
//   PW_BASE_URL=https://frequencylocal.com pnpm exec playwright test public-surface
//   PW_SITE_URLS=https://house-of-fates.frequencylocal.com,https://alliraebuilddesign.frequencylocal.com,https://royaltemple.frequencylocal.com
//
// Use the canonical (apex) host: www redirects to it and Playwright would follow, hiding the
// redirect assertion below. Self-skips without PW_BASE_URL like the rest of the e2e suite.
import { readFileSync } from 'node:fs'
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
// Request-only checks do not vary by viewport: run them once, under the first project.
const onlyOnce = ({}, testInfo: { project: { name: string } }) => testInfo.project.name !== 'mobile'
const siteURLs = (process.env.PW_SITE_URLS ?? '').split(',').map((s) => s.trim()).filter(Boolean)

test.describe('public surface (platform host)', { tag: '@public-surface' }, () => {
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

  test('/api/status is JSON, cacheable, and carries build identity', async ({ request }) => {
    const res = await request.get('/api/status')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('application/json')
    expect(res.headers()['cache-control']).toMatch(/s-maxage=\d+/)
    const json = await res.json()
    expect(json.service).toBe('frequency')
    expect(json.build.env).toBe('production')
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

  test('/themes/midnight and its demo permanently redirect to nocturne', async ({ request }) => {
    for (const [from, to] of [['/themes/midnight', '/themes/nocturne'], ['/themes/midnight/demo', '/themes/nocturne/demo']]) {
      const res = await request.get(from, { maxRedirects: 0 })
      expect(res.status(), from).toBe(308)
      expect(new URL(res.headers()['location'], baseURL).pathname).toBe(to)
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

  test('MapLibre worker and shared chunk are served as JavaScript from /maplibre/', async ({ request }) => {
    for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
      const res = await request.get(`/maplibre/${file}`)
      expect(res.status(), file).toBe(200)
      expect(res.headers()['content-type'] ?? '', file).toMatch(/javascript/)
      expect((await res.body()).length, `${file} is not an empty or error body`).toBeGreaterThan(1000)
    }
  })

  // Off by default. A cron route that wrongly accepts an anonymous call would RUN that cron in
  // production, so this only fires when someone opts in with PW_PROBE_CRON=1. It sends no secret.
  test('cron routes reject an unauthenticated call', async ({ request }) => {
    test.skip(process.env.PW_PROBE_CRON !== '1', 'PW_PROBE_CRON=1 to opt in (see comment).')
    const { crons } = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons: { path: string }[] }
    for (const { path } of crons) {
      const res = await request.get(path, { maxRedirects: 0 })
      expect(res.status(), path).toBe(401)
    }
  })

  test('www redirects permanently to the apex and keeps the path', async ({ playwright }) => {
    const ctx = await playwright.request.newContext()
    const apex = new URL(baseURL!)
    if (apex.hostname.startsWith('www.')) return
    const res = await ctx.get(`https://www.${apex.hostname}/pricing`, { maxRedirects: 0 })
    expect([301, 308]).toContain(res.status())
    expect(new URL(res.headers()['location']).host).toBe(apex.host)
    expect(new URL(res.headers()['location']).pathname).toBe('/pricing')
    await ctx.dispose()
  })
})

test.describe('public surface (live Space sites)', { tag: '@public-surface' }, () => {
  test.skip(siteURLs.length === 0, 'PW_SITE_URLS is not set.')
  test.skip(onlyOnce, 'viewport-independent: runs under mobile only')

  for (const site of siteURLs) {
    const origin = new URL(site).origin

    test(`${origin}: home renders, self-canonical, no theme leakage into the head contract`, async ({ playwright }) => {
      const ctx = await playwright.request.newContext({ baseURL: origin })
      const res = await ctx.get('/')
      expect(res.status()).toBe(200)
      const html = await res.text()
      expect(pageTitle(html)).toBeTruthy()
      const canon = canonicalHref(html)
      expect(canon, 'canonical').toBeTruthy()
      expect(new URL(canon!).host, 'canonical host is the site, not the platform').toBe(new URL(origin).host)
      for (const b of jsonLdBlocks(html)) expect(b.error).toBeUndefined()
      // ISR / anonymous render: a Set-Cookie here means a cookie client crept into the loader.
      expect(res.headers()['set-cookie'], 'site render must not set cookies').toBeUndefined()
      await ctx.dispose()
    })

    test(`${origin}: robots hides admin, names its own sitemap; sitemap URLs stay on-site`, async ({ playwright }) => {
      const ctx = await playwright.request.newContext({ baseURL: origin })
      const robots = await (await ctx.get('/robots.txt')).text()
      expect(robotsDisallows(robots)).toContain('/admin')
      expect(robotsSitemaps(robots)).toEqual([`${origin}/sitemap.xml`])
      const sm = await ctx.get('/sitemap.xml')
      expect(sm.status()).toBe(200)
      const locs = sitemapLocs(await sm.text())
      expect(locs.length).toBeGreaterThan(0)
      for (const loc of locs) expect(new URL(loc).host, loc).toBe(new URL(origin).host)
      await ctx.dispose()
    })

    test(`${origin}: deep unknown path is a real 404`, async ({ playwright }) => {
      const ctx = await playwright.request.newContext({ baseURL: origin })
      const res = await ctx.get('/qa-probe/does/not/exist')
      expect(res.status()).toBe(404)
      await ctx.dispose()
    })
  }
})
