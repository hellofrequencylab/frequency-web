import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { APP_HOST_PATTERN, isAppHost, normalizeHost, parseAppHosts, routeSiteHost } from './host'

describe('normalizeHost', () => {
  it('lowercases and strips the port', () => {
    expect(normalizeHost('DanielTyack.com:443')).toBe('danieltyack.com')
  })
})

describe('isAppHost', () => {
  it("treats Frequency's own domains, previews and local hosts as the app", () => {
    for (const h of ['frequencylocal.com', 'www.frequencylocal.com', 'go.findafreq.com', 'frequency-web-git-x.vercel.app', 'localhost:3000', '127.0.0.1', '']) {
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

  it('sends deeper paths to the same path on Frequency', () => {
    const route = routeSiteHost('danieltyack.com', '/spaces/danieltyack/book', '')
    expect(route.kind).toBe('redirect')
    expect(route.kind === 'redirect' && route.location.endsWith('/spaces/danieltyack/book')).toBe(true)
  })
})

describe("a site host's crawler files (LIVE-783)", () => {
  it('rewrites robots.txt and sitemap.xml to the hosted crawler routes', () => {
    expect(routeSiteHost('danieltyack.com', '/robots.txt', '')).toEqual({
      kind: 'rewrite',
      pathname: '/hosted/danieltyack.com/robots.txt',
    })
    expect(routeSiteHost('danieltyack.com', '/sitemap.xml', '')).toEqual({
      kind: 'rewrite',
      pathname: '/hosted/danieltyack.com/sitemap.xml',
    })
  })

  it("leaves Frequency's own crawler files alone", () => {
    expect(routeSiteHost('frequencylocal.com', '/robots.txt', '')).toEqual({ kind: 'none' })
  })

  it("matches the proxy matcher's host arm to isAppHost, anchored the way Next anchors it", () => {
    const re = new RegExp(`^${APP_HOST_PATTERN}$`)
    for (const h of ['frequencylocal.com', 'www.frequencylocal.com', 'go.findafreq.com', 'frequency-web-git-x.vercel.app', 'localhost', '127.0.0.1']) {
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
    expect(config).toContain(`source: '/(robots\\\\.txt|sitemap\\\\.xml)'`)
  })
})
