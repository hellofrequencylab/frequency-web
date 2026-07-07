import { describe, it, expect } from 'vitest'

// The web tool seam's PURE parts: the SSRF guard (only public http(s) is fetchable), the
// dependency-free html-to-text, and the search-result shaping. The fetch/search IO itself is
// exercised through the harvest fail-safe test with a mock provider.

import { isFetchableUrl, isPrivateIpv4, isPrivateIpv6, htmlToText, extractTitle, extractHeadHtml, parseBraveResults } from './index'

describe('isFetchableUrl — SSRF guard', () => {
  it('allows legitimate public http(s) hosts', () => {
    expect(isFetchableUrl('https://acme.com')).toBe(true)
    expect(isFetchableUrl('http://example.org/about')).toBe(true)
    expect(isFetchableUrl('https://sub.business.co.uk/services')).toBe(true)
    expect(isFetchableUrl('https://8.8.8.8')).toBe(true) // a public IP is fine
  })

  it('blocks non-http schemes', () => {
    expect(isFetchableUrl('file:///etc/passwd')).toBe(false)
    expect(isFetchableUrl('ftp://x.com')).toBe(false)
    expect(isFetchableUrl('javascript:alert(1)')).toBe(false)
    expect(isFetchableUrl('gopher://x.com')).toBe(false)
  })

  it('blocks localhost and private / metadata ranges', () => {
    expect(isFetchableUrl('http://localhost:3000')).toBe(false)
    expect(isFetchableUrl('http://127.0.0.1')).toBe(false)
    expect(isFetchableUrl('http://10.0.0.5')).toBe(false)
    expect(isFetchableUrl('http://192.168.1.1')).toBe(false)
    expect(isFetchableUrl('http://172.16.0.1')).toBe(false)
    expect(isFetchableUrl('http://169.254.169.254')).toBe(false) // cloud metadata
    expect(isFetchableUrl('http://[::1]')).toBe(false)
    expect(isFetchableUrl('http://0.0.0.0')).toBe(false)
    expect(isFetchableUrl('http://100.64.0.1')).toBe(false) // CGNAT
  })

  // REGRESSION (CodeQL "Incomplete regular expression for hostnames"): a loose/unanchored host regex
  // let a public-looking host that merely CONTAINS a blocked label slip through. These bypass strings
  // must all be REJECTED, and the legit ones accepted, because the guard parses the REAL host.
  it('is not bypassable by hostname-confusion tricks', () => {
    // A public host that merely embeds a blocked token must NOT be blocked as private...
    expect(isFetchableUrl('http://notlocalhost.com')).toBe(true)
    expect(isFetchableUrl('http://10.0.0.5.example.com')).toBe(true) // not an IP literal; a real domain
    // ...but an attacker domain that ends in a blocked suffix, or dresses one up, must be blocked.
    expect(isFetchableUrl('http://foo.internal')).toBe(false)
    expect(isFetchableUrl('http://service.local')).toBe(false)
    expect(isFetchableUrl('http://api.localhost')).toBe(false)
    // The classic "public.com.attacker" confusion resolves to host attacker-controlled but PUBLIC,
    // so it is fetchable (not private) — the guard must not falsely trust it as our own host though;
    // its job is only the private/loopback block, which correctly leaves this public.
    expect(isFetchableUrl('http://example.com.attacker.com')).toBe(true)
    // IPv6 link-local + unique-local variants (fe80::/10, fc00::/7) blocked; IPv4-mapped loopback blocked.
    expect(isFetchableUrl('http://[fe80::1]')).toBe(false)
    expect(isFetchableUrl('http://[fc00::1]')).toBe(false)
    expect(isFetchableUrl('http://[fd12:3456::1]')).toBe(false)
    expect(isFetchableUrl('http://[::ffff:127.0.0.1]')).toBe(false)
  })

  it('rejects garbage', () => {
    expect(isFetchableUrl('not a url')).toBe(false)
    expect(isFetchableUrl('')).toBe(false)
  })
})

describe('isPrivateIpv4 / isPrivateIpv6 — anchored numeric range checks', () => {
  it('flags every private IPv4 range and passes public ones', () => {
    for (const ip of ['0.0.0.0', '10.1.2.3', '127.0.0.1', '169.254.1.1', '172.16.5.5', '172.31.9.9', '192.168.0.1', '100.64.3.3']) {
      expect(isPrivateIpv4(ip)).toBe(true)
    }
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '11.0.0.1', '100.63.0.1']) {
      expect(isPrivateIpv4(ip)).toBe(false)
    }
  })
  it('rejects a non-IPv4 or over-range host without a false match', () => {
    expect(isPrivateIpv4('999.999.999.999')).toBe(false) // invalid octets, not a literal
    expect(isPrivateIpv4('10.0.0.5.example.com')).toBe(false) // a domain, not an IP
  })
  it('flags IPv6 loopback / unique-local / link-local', () => {
    expect(isPrivateIpv6('::1')).toBe(true)
    expect(isPrivateIpv6('fe80::1')).toBe(true)
    expect(isPrivateIpv6('fc00::1')).toBe(true)
    expect(isPrivateIpv6('fd00::1')).toBe(true)
    expect(isPrivateIpv6('2001:4860:4860::8888')).toBe(false) // public
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

  // REGRESSION (CodeQL "Incomplete multi-character sanitization"): a single regex pass can be evaded
  // by nested / overlapping tags that reassemble into a tag after one pass. The stripper loops to a
  // fixed point, so NO tag survives.
  it('leaves no tag surviving a nested / overlapping-tag payload', () => {
    const payload = '<scr<script>ipt>alert(1)</script> hello <<img>b>world<i<i>>x'
    const out = htmlToText(payload)
    expect(out).not.toMatch(/<[a-z/]/i) // no opening tag survives
    expect(out).not.toContain('script')
    expect(out).not.toContain('alert')
    expect(out).toContain('hello')
    expect(out).toContain('world')
  })

  it('strips a nested style element that reassembles after one pass', () => {
    const payload = '<sty<style>le>.x{color:red}</style>Visible'
    const out = htmlToText(payload)
    expect(out).not.toContain('color:red')
    expect(out).not.toContain('style')
    expect(out).toContain('Visible')
  })

  it('does not hang on a pathological angle-bracket input (ReDoS-safe)', () => {
    const nasty = '<' + 'a'.repeat(20000) // an unclosed tag, no closing '>'
    const start = Date.now()
    const out = htmlToText(nasty)
    expect(Date.now() - start).toBeLessThan(1000)
    expect(out).not.toContain('<')
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
