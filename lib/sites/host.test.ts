import { describe, expect, it } from 'vitest'
import { isAppHost, normalizeHost, parseAppHosts, routeSiteHost } from './host'

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
