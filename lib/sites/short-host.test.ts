import { describe, expect, it } from 'vitest'
import { isShortLinkHost, routeSiteHost, shortLinkHostRoute } from './host'
import { shorterLinkFor } from '@/lib/share/short-link'

describe('freq.ie short-link host', () => {
  it('recognises the host and its www', () => {
    expect(isShortLinkHost('freq.ie')).toBe(true)
    expect(isShortLinkHost('FREQ.IE:443')).toBe(true)
    expect(isShortLinkHost('www.freq.ie')).toBe(true)
    expect(isShortLinkHost('frequencylocal.com')).toBe(false)
    expect(isShortLinkHost('evilfreq.ie')).toBe(false)
  })
  it('rewrites /<code> to the share-link resolver', () => {
    expect(routeSiteHost('freq.ie', '/x7k2mab', '', new Set())).toEqual({ kind: 'rewrite', pathname: '/s/x7k2mab' })
  })
  it('sends the bare host to Frequency and 404s everything else', () => {
    const root = shortLinkHostRoute('freq.ie', '/', '')
    expect(root.kind).toBe('redirect')
    expect(shortLinkHostRoute('freq.ie', '/s/x7k2mab', '').kind).toBe('not-found')
    expect(shortLinkHostRoute('freq.ie', '/ab', '').kind).toBe('not-found')
    expect(shortLinkHostRoute('freq.ie', '/admin', '').kind).toBe('rewrite') // a 5-letter code shape; the resolver 404s unknown codes
    expect(shortLinkHostRoute('freq.ie', '/robots.txt', '').kind).toBe('not-found')
  })
  it('www goes to the bare host', () => {
    expect(shortLinkHostRoute('www.freq.ie', '/x7k2mab', '?a=1')).toEqual({
      kind: 'redirect',
      location: 'https://freq.ie/x7k2mab?a=1',
      permanent: true,
    })
  })
  it('builds the freq.ie form only from a /s/<code> path', () => {
    expect(shorterLinkFor('/s/x7k2mab')).toBe('https://freq.ie/x7k2mab')
    expect(shorterLinkFor('/events/x')).toBeNull()
  })
})
