import { describe, expect, it } from 'vitest'
import { parseSiteDomain } from './domain'
import { recordName, recordsFor } from './vercel-domains'

describe('parseSiteDomain', () => {
  it('strips the scheme, www, path and case', () => {
    expect(parseSiteDomain('https://www.DanielTyack.com/about')).toEqual({ ok: true, domain: 'danieltyack.com' })
  })

  it('keeps a subdomain other than www', () => {
    expect(parseSiteDomain('site.example.co.uk')).toEqual({ ok: true, domain: 'site.example.co.uk' })
  })

  it('rejects things that are not domains', () => {
    for (const bad of ['', 'danieltyack', 'bad_domain.com', '-x.com', '1.2.3.4']) {
      expect(parseSiteDomain(bad).ok).toBe(false)
    }
  })

  it("rejects Frequency's own domains", () => {
    expect(parseSiteDomain('frequencylocal.com').ok).toBe(false)
  })
})

describe('DNS records', () => {
  it('names records the way a registrar does', () => {
    expect(recordName('danieltyack.com', 'danieltyack.com')).toBe('@')
    expect(recordName('_vercel.danieltyack.com', 'danieltyack.com')).toBe('_vercel')
  })

  it('gives the apex A record and the www CNAME, plus any ownership TXT', () => {
    const records = recordsFor('danieltyack.com', {
      verification: [{ type: 'TXT', domain: '_vercel.danieltyack.com', value: 'vc-domain-verify=abc' }],
    })
    expect(records.map((r) => `${r.type} ${r.name} ${r.value}`)).toEqual([
      'A @ 76.76.21.21',
      'CNAME www cname.vercel-dns.com',
      'TXT _vercel vc-domain-verify=abc',
    ])
  })
})
