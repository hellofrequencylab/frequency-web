import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  APP_HOST_PATTERN,
  RESERVED_SITE_SUBDOMAINS,
  SITE_BASE_DOMAIN,
  isAppHost,
  normalizeHost,
  parseAppHosts,
  routeSiteHost,
  siteSlugFromSubdomain,
  siteSubdomainHost,
} from './host'

describe('normalizeHost', () => {
  it('lowercases and strips the port', () => {
    expect(normalizeHost('DanielTyack.com:443')).toBe('danieltyack.com')
  })
})

describe('isAppHost', () => {
  it("treats Frequency's own domains, previews and local hosts as the app", () => {
    for (const h of ['frequencylocal.com', 'www.frequencylocal.com', 'frequency-web-git-x.vercel.app', 'localhost:3000', '127.0.0.1', '']) {
      expect(isAppHost(h)).toBe(true)
    }
  })

  it('treats an extra APP_HOSTS entry as the app', () => {
    expect(isAppHost('staging.example.org', parseAppHosts('staging.example.org'))).toBe(true)
  })

  it("treats a Space's own domain as a site", () => {
    expect(isAppHost('danieltyack.com')).toBe(false)
  })
})

describe('routeSiteHost', () => {
  it("leaves Frequency's own host alone", () => {
    expect(routeSiteHost('frequencylocal.com', '/feed', '')).toEqual({ kind: 'none' })
  })

  it('rewrites the site root to the hosted route', () => {
    expect(routeSiteHost('danieltyack.com', '/', '')).toEqual({ kind: 'rewrite', pathname: '/hosted/danieltyack.com' })
  })

  it('rewrites a page path to the hosted page route', () => {
    expect(routeSiteHost('danieltyack.com:443', '/about', '')).toEqual({
      kind: 'rewrite',
      pathname: '/hosted/danieltyack.com/about',
    })
  })

  it('redirects www to the apex, keeping the path and query', () => {
    expect(routeSiteHost('www.danieltyack.com', '/about', '?a=1')).toEqual({
      kind: 'redirect',
      location: 'https://danieltyack.com/about?a=1',
      permanent: true,
    })
  })

  // Owner ruling 2026-10-07 (ADR-1723): "When a user is on the website, they should never be re directed
  // back to the main site for anything." A deeper path stays on the site or is not found there.
  it('lands a Space path on the site page it stands for, never on Frequency', () => {
    expect(routeSiteHost('danieltyack.com', '/spaces/danieltyack/book', '?a=1')).toEqual({
      kind: 'redirect',
      location: 'https://danieltyack.com/book?a=1',
      permanent: false,
    })
    expect(routeSiteHost('danieltyack.com', '/spaces/danieltyack', '')).toEqual({
      kind: 'redirect',
      location: 'https://danieltyack.com/',
      permanent: false,
    })
  })

  it('answers any other deeper path with not found on the site', () => {
    expect(routeSiteHost('danieltyack.com', '/events/abc', '')).toEqual({ kind: 'not-found' })
    expect(routeSiteHost('danieltyack.com', '/spaces/danieltyack/book/extra', '')).toEqual({ kind: 'not-found' })
  })
})

describe('the internal /hosted route on Frequency (LIVE-784)', () => {
  it("404s /hosted asked for directly on Frequency's own host, so a site is never served twice", () => {
    expect(routeSiteHost('frequencylocal.com', '/hosted/danieltyack.com', '')).toEqual({ kind: 'not-found' })
    expect(routeSiteHost('frequencylocal.com', '/hosted', '')).toEqual({ kind: 'not-found' })
    expect(routeSiteHost('frequencylocal.com', '/hostedx', '')).toEqual({ kind: 'none' })
  })

  it('404s /hosted on a site host, on the site itself', () => {
    expect(routeSiteHost('danieltyack.com', '/hosted/other.com', '')).toEqual({ kind: 'not-found' })
  })
})

describe("a site host's crawler files (LIVE-783)", () => {
  it('rewrites robots.txt, sitemap.xml and llms.txt to the hosted crawler routes', () => {
    expect(routeSiteHost('danieltyack.com', '/robots.txt', '')).toEqual({
      kind: 'rewrite',
      pathname: '/hosted/danieltyack.com/robots.txt',
    })
    expect(routeSiteHost('danieltyack.com', '/sitemap.xml', '')).toEqual({
      kind: 'rewrite',
      pathname: '/hosted/danieltyack.com/site-sitemap',
    })
    expect(routeSiteHost('danieltyack.com', '/llms.txt', '')).toEqual({
      kind: 'rewrite',
      pathname: '/hosted/danieltyack.com/site-llms',
    })
  })

  it("leaves Frequency's own crawler files alone", () => {
    expect(routeSiteHost('frequencylocal.com', '/robots.txt', '')).toEqual({ kind: 'none' })
  })

  it("matches the proxy matcher's host arm to isAppHost, anchored the way Next anchors it", () => {
    const re = new RegExp(`^${APP_HOST_PATTERN}$`)
    for (const h of ['frequencylocal.com', 'www.frequencylocal.com', 'frequency-web-git-x.vercel.app', 'localhost', '127.0.0.1']) {
      expect(re.test(h), h).toBe(true)
      expect(isAppHost(h), h).toBe(true)
    }
    for (const h of ['danieltyack.com', 'www.danieltyack.com', 'mylocalhostshop.com', 'frequencylocal.com.evil.org']) {
      expect(re.test(h), h).toBe(false)
      expect(isAppHost(h), h).toBe(false)
    }
  })

  it('proxy.ts carries the same host pattern, literally, in its matcher', () => {
    const proxy = readFileSync('proxy.ts', 'utf8')
    const config = proxy.slice(proxy.indexOf('export const config'))
    // The source spells each backslash twice (a TS string literal); the runtime value has one.
    const asSource = APP_HOST_PATTERN.split('\\').join('\\\\')
    expect(config).toContain(`value: '${asSource}'`)
    expect(config).toContain(`source: '/(robots\\\\.txt|sitemap\\\\.xml|llms\\\\.txt)'`)
  })
})

describe('the free website subdomain (LIVE-782)', () => {
  it('defaults the base domain to frequencylocal.com', () => {
    expect(SITE_BASE_DOMAIN).toBe('frequencylocal.com')
  })

  it('reads the Space slug off a one-label subdomain', () => {
    expect(siteSlugFromSubdomain('danieltyack.frequencylocal.com')).toBe('danieltyack')
    expect(siteSlugFromSubdomain('DanielTyack.FrequencyLocal.com:443')).toBe('danieltyack')
    expect(siteSlugFromSubdomain('encinitas-nexus.frequencylocal.com')).toBe('encinitas-nexus')
  })

  it('keeps the apex, reserved labels, deeper subdomains and other domains off the site path', () => {
    for (const h of [
      'frequencylocal.com',
      'www.frequencylocal.com',
      'app.frequencylocal.com',
      'api.frequencylocal.com',
      'send.frequencylocal.com',
      'people.frequencylocal.com',
      'help.frequencylocal.com',
      'www.danieltyack.frequencylocal.com',
      'danieltyack.findafreq.com',
      'danieltyack.com',
      'frequencylocal.com.evil.org',
      'danieltyack.frequencylocal.com.evil.org',
    ]) {
      expect(siteSlugFromSubdomain(h), h).toBeNull()
    }
  })

  it('rejects labels that are not a valid Space slug', () => {
    for (const h of ['-bad.frequencylocal.com', 'bad-.frequencylocal.com', 'a--b.frequencylocal.com', 'xn--abc.frequencylocal.com', 'a_b.frequencylocal.com', `${'a'.repeat(64)}.frequencylocal.com`]) {
      expect(siteSlugFromSubdomain(h), h).toBeNull()
    }
  })

  it('honours another base domain', () => {
    expect(siteSlugFromSubdomain('danieltyack.example.net', 'example.net')).toBe('danieltyack')
    expect(siteSlugFromSubdomain('danieltyack.frequencylocal.com', 'example.net')).toBeNull()
  })

  it('spells the free host for a slug, or null when the slug cannot be one', () => {
    expect(siteSubdomainHost('danieltyack')).toBe('danieltyack.frequencylocal.com')
    expect(siteSubdomainHost('www')).toBeNull()
    expect(siteSubdomainHost('Not A Slug')).toBeNull()
    for (const label of RESERVED_SITE_SUBDOMAINS) expect(siteSubdomainHost(label), label).toBeNull()
  })

  it('stays one of Frequency own hosts, so nobody claims it as a custom domain', () => {
    expect(isAppHost('danieltyack.frequencylocal.com')).toBe(true)
  })

  it('rewrites the subdomain root, pages and crawler files to the hosted route', () => {
    const h = 'danieltyack.frequencylocal.com'
    expect(routeSiteHost(h, '/', '')).toEqual({ kind: 'rewrite', pathname: `/hosted/${h}` })
    expect(routeSiteHost(h, '/about', '')).toEqual({ kind: 'rewrite', pathname: `/hosted/${h}/about` })
    expect(routeSiteHost(h, '/robots.txt', '')).toEqual({ kind: 'rewrite', pathname: `/hosted/${h}/robots.txt` })
    expect(routeSiteHost(h, '/sitemap.xml', '')).toEqual({ kind: 'rewrite', pathname: `/hosted/${h}/site-sitemap` })
  })

  it('keeps deeper paths and /hosted on the subdomain on the site', () => {
    const h = 'danieltyack.frequencylocal.com'
    const deep = routeSiteHost(h, '/spaces/danieltyack/book', '?x=1')
    expect(deep).toEqual({ kind: 'redirect', location: `https://${h}/book?x=1`, permanent: false })
    expect(routeSiteHost(h, '/hosted/other.com', '')).toEqual({ kind: 'not-found' })
  })

  it('leaves reserved subdomains and an APP_HOSTS override as the app', () => {
    expect(routeSiteHost('www.frequencylocal.com', '/', '')).toEqual({ kind: 'none' })
    expect(routeSiteHost('app.frequencylocal.com', '/feed', '')).toEqual({ kind: 'none' })
    expect(routeSiteHost('help.frequencylocal.com', '/hosted/x', '')).toEqual({ kind: 'not-found' })
    expect(routeSiteHost('staging2.frequencylocal.com', '/', '', parseAppHosts('staging2.frequencylocal.com'))).toEqual({ kind: 'none' })
  })

  it("lets a website subdomain's crawler files through the proxy matcher", () => {
    const re = new RegExp(`^${APP_HOST_PATTERN}$`)
    expect(re.test('danieltyack.frequencylocal.com')).toBe(false)
    // A reserved one-label host also reaches the proxy, which passes Frequency's own file through.
    expect(routeSiteHost('help.frequencylocal.com', '/robots.txt', '')).toEqual({ kind: 'none' })
    // Every host the matcher keeps away from the proxy is one routeSiteHost leaves alone.
    for (const h of ['frequencylocal.com', 'www.frequencylocal.com', 'www.danieltyack.frequencylocal.com', 'a.b.frequencylocal.com']) {
      expect(re.test(h), h).toBe(true)
      expect(routeSiteHost(h, '/robots.txt', ''), h).toEqual({ kind: 'none' })
    }
  })
})
