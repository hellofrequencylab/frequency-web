import { describe, it, expect } from 'vitest'

// The web tool seam's PURE parts: the SSRF guard (only public http(s) is fetchable), the
// dependency-free html-to-text, and the search-result shaping. The fetch/search IO itself is
// exercised through the harvest fail-safe test with a mock provider.

import { isFetchableUrl, htmlToText, extractTitle, extractHeadHtml, parseBraveResults } from './index'

describe('isFetchableUrl — SSRF guard', () => {
  it('allows public http(s) hosts', () => {
    expect(isFetchableUrl('https://acme.com')).toBe(true)
    expect(isFetchableUrl('http://example.org/about')).toBe(true)
  })

  it('blocks non-http schemes', () => {
    expect(isFetchableUrl('file:///etc/passwd')).toBe(false)
    expect(isFetchableUrl('ftp://x.com')).toBe(false)
    expect(isFetchableUrl('javascript:alert(1)')).toBe(false)
  })

  it('blocks localhost and private / metadata ranges', () => {
    expect(isFetchableUrl('http://localhost:3000')).toBe(false)
    expect(isFetchableUrl('http://127.0.0.1')).toBe(false)
    expect(isFetchableUrl('http://10.0.0.5')).toBe(false)
    expect(isFetchableUrl('http://192.168.1.1')).toBe(false)
    expect(isFetchableUrl('http://172.16.0.1')).toBe(false)
    expect(isFetchableUrl('http://169.254.169.254')).toBe(false) // cloud metadata
    expect(isFetchableUrl('http://[::1]')).toBe(false)
  })

  it('rejects garbage', () => {
    expect(isFetchableUrl('not a url')).toBe(false)
    expect(isFetchableUrl('')).toBe(false)
  })
})

describe('htmlToText', () => {
  it('strips scripts, styles, and tags and collapses whitespace', () => {
    const html = '<html><head><style>.x{}</style></head><body><script>evil()</script><p>Hello    world</p><p>Line two</p></body></html>'
    const text = htmlToText(html)
    expect(text).not.toMatch(/evil|\.x\{/)
    expect(text).toContain('Hello world')
    expect(text).toContain('Line two')
  })

  it('decodes common entities', () => {
    expect(htmlToText('<p>Tom &amp; Jerry&#39;s</p>')).toContain("Tom & Jerry's")
  })

  it('bounds the length', () => {
    const long = '<p>' + 'a'.repeat(5000) + '</p>'
    expect(htmlToText(long, 100).length).toBeLessThanOrEqual(100)
  })
})

describe('extractTitle / extractHeadHtml', () => {
  it('pulls the title', () => {
    expect(extractTitle('<html><head><title>Acme Coffee</title></head></html>')).toBe('Acme Coffee')
  })
  it('returns the head slice', () => {
    const head = extractHeadHtml('<html><head><meta property="og:image" content="x"></head><body>ignore</body></html>')
    expect(head).toContain('og:image')
    expect(head).not.toContain('ignore')
  })
})

describe('parseBraveResults', () => {
  it('shapes results and drops entries with no url', () => {
    const out = parseBraveResults({
      web: {
        results: [
          { title: 'Acme', url: 'https://acme.com', description: 'A <b>great</b> cafe' },
          { title: 'No url', description: 'x' },
        ],
      },
    })
    expect(out).toHaveLength(1)
    expect(out[0].url).toBe('https://acme.com')
    expect(out[0].snippet).toContain('great')
  })

  it('handles an empty payload', () => {
    expect(parseBraveResults({})).toEqual([])
  })
})
