import { describe, expect, it } from 'vitest'
import { normalizeHost, parseSiteHosts, routeSiteHost } from './host'

const hosts = parseSiteHosts('danieltyack.com, WWW.Example.org ')

describe('parseSiteHosts', () => {
  it('normalizes and drops www', () => {
    expect([...hosts]).toEqual(['danieltyack.com', 'example.org'])
  })

  it('is empty when unset', () => {
    expect(parseSiteHosts(undefined).size).toBe(0)
  })
})

describe('normalizeHost', () => {
  it('lowercases and strips the port', () => {
    expect(normalizeHost('DanielTyack.com:443')).toBe('danieltyack.com')
  })
})

describe('routeSiteHost', () => {
  it('leaves every host alone when no site hosts are configured', () => {
    expect(routeSiteHost('danieltyack.com', '/', '', new Set())).toEqual({ kind: 'none' })
  })

  it("leaves Frequency's own host alone", () => {
    expect(routeSiteHost('frequencylocal.com', '/feed', '', hosts)).toEqual({ kind: 'none' })
  })

  it('rewrites the site root to the hosted route', () => {
    expect(routeSiteHost('danieltyack.com', '/', '', hosts)).toEqual({ kind: 'rewrite', pathname: '/hosted/danieltyack.com' })
  })

  it('rewrites a page path to the hosted page route', () => {
    expect(routeSiteHost('danieltyack.com:443', '/about', '', hosts)).toEqual({
      kind: 'rewrite',
      pathname: '/hosted/danieltyack.com/about',
    })
  })

  it('redirects www to the apex, keeping the path and query', () => {
    expect(routeSiteHost('www.danieltyack.com', '/about', '?a=1', hosts)).toEqual({
      kind: 'redirect',
      location: 'https://danieltyack.com/about?a=1',
      permanent: true,
    })
  })

  it('sends deeper paths to the same path on Frequency', () => {
    const route = routeSiteHost('danieltyack.com', '/spaces/danieltyack/book', '', hosts)
    expect(route.kind).toBe('redirect')
    expect(route.kind === 'redirect' && route.location.endsWith('/spaces/danieltyack/book')).toBe(true)
  })
})
