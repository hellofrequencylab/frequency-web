import { describe, it, expect } from 'vitest'
import { nodeUrl, connectUrl, isSiteLink, toAbsoluteSiteUrl } from './links'
import { SITE_URL } from '@/lib/site'

describe('qr links', () => {
  it('builds an absolute node capture URL', () => {
    expect(nodeUrl('abc-123')).toBe(`${SITE_URL}/n/abc-123`)
  })

  it('builds an absolute member connect URL from a handle', () => {
    expect(connectUrl('daniel')).toBe(`${SITE_URL}/people/daniel`)
  })

  it('accepts our own absolute links and root-relative paths', () => {
    expect(isSiteLink('/n/abc')).toBe(true)
    expect(isSiteLink(`${SITE_URL}/people/x`)).toBe(true)
  })

  it('rejects third-party and bare links (not an open generator)', () => {
    expect(isSiteLink('https://evil.example/phish')).toBe(false)
    expect(isSiteLink('n/abc')).toBe(false)
    expect(isSiteLink('javascript:alert(1)')).toBe(false)
  })

  it('resolves root-relative paths to absolute, leaves absolute untouched', () => {
    expect(toAbsoluteSiteUrl('/n/abc')).toBe(`${SITE_URL}/n/abc`)
    expect(toAbsoluteSiteUrl(`${SITE_URL}/n/abc`)).toBe(`${SITE_URL}/n/abc`)
  })
})
