import { describe, it, expect } from 'vitest'
import {
  isHeaderCtaFunction,
  headerCtaFunctionLabel,
  isValidCtaUrl,
  readHeaderCtaPreference,
  nextHeaderCtaPreferences,
  headerCtaFunctionHref,
  resolveHeaderCta,
  HEADER_CTA_FUNCTIONS,
} from './header-cta'

// The OPERATOR-EDITABLE HEADER CTA contract. The normalizer must be tolerant (any junk -> null), the
// resolver total (always a label + href), the URL guard strict (only safe hrefs stored), and the merge
// non-destructive (only the headerCta node touched; null clears it).

const BASE = '/spaces/river-yoga'

describe('isHeaderCtaFunction', () => {
  it('accepts registered keys and rejects everything else', () => {
    for (const f of HEADER_CTA_FUNCTIONS) expect(isHeaderCtaFunction(f.key)).toBe(true)
    expect(isHeaderCtaFunction('nope')).toBe(false)
    expect(isHeaderCtaFunction(null)).toBe(false)
    expect(isHeaderCtaFunction(123)).toBe(false)
  })
})

describe('headerCtaFunctionLabel', () => {
  it('returns the plain default label per function', () => {
    expect(headerCtaFunctionLabel('book')).toBe('Book now')
    expect(headerCtaFunctionLabel('contact')).toBe('Contact me')
    expect(headerCtaFunctionLabel('offerings')).toBe('View offerings')
  })
})

describe('isValidCtaUrl', () => {
  it('accepts absolute http(s) URLs and same-origin paths', () => {
    expect(isValidCtaUrl('https://example.com')).toBe(true)
    expect(isValidCtaUrl('http://example.com/shop')).toBe(true)
    expect(isValidCtaUrl('/spaces/x/book')).toBe(true)
  })
  it('rejects unsafe or malformed values', () => {
    expect(isValidCtaUrl('')).toBe(false)
    expect(isValidCtaUrl('   ')).toBe(false)
    expect(isValidCtaUrl('javascript:alert(1)')).toBe(false)
    expect(isValidCtaUrl('//evil.com')).toBe(false) // protocol-relative
    expect(isValidCtaUrl('example.com')).toBe(false) // no scheme, not a path
  })
})

describe('readHeaderCtaPreference', () => {
  it('returns null for junk / absent / malformed blobs', () => {
    expect(readHeaderCtaPreference(null)).toBeNull()
    expect(readHeaderCtaPreference('nope')).toBeNull()
    expect(readHeaderCtaPreference([])).toBeNull()
    expect(readHeaderCtaPreference({})).toBeNull()
    expect(readHeaderCtaPreference({ headerCta: {} })).toBeNull()
    expect(readHeaderCtaPreference({ headerCta: { kind: 'function', function: 'bogus' } })).toBeNull()
    expect(readHeaderCtaPreference({ headerCta: { kind: 'custom', url: 'javascript:x', label: 'Go' } })).toBeNull()
    expect(readHeaderCtaPreference({ headerCta: { kind: 'custom', url: 'https://x.com', label: '' } })).toBeNull()
  })
  it('reads a function override, keeping an optional label', () => {
    expect(readHeaderCtaPreference({ headerCta: { kind: 'function', function: 'contact' } })).toEqual({
      kind: 'function',
      function: 'contact',
    })
    expect(
      readHeaderCtaPreference({ headerCta: { kind: 'function', function: 'book', label: '  Reserve  ' } }),
    ).toEqual({ kind: 'function', function: 'book', label: 'Reserve' })
  })
  it('reads a valid custom override (trimmed)', () => {
    expect(
      readHeaderCtaPreference({ headerCta: { kind: 'custom', url: ' https://shop.io ', label: ' Shop ' } }),
    ).toEqual({ kind: 'custom', url: 'https://shop.io', label: 'Shop' })
  })
})

describe('headerCtaFunctionHref', () => {
  it('maps anchors to Home sections and the rest to /book', () => {
    expect(headerCtaFunctionHref('contact', BASE)).toBe(`${BASE}#contact`)
    expect(headerCtaFunctionHref('offerings', BASE)).toBe(`${BASE}#offerings`)
    expect(headerCtaFunctionHref('book', BASE)).toBe(`${BASE}/book`)
    expect(headerCtaFunctionHref('tickets', BASE)).toBe(`${BASE}/book`)
    expect(headerCtaFunctionHref('donate', BASE)).toBe(`${BASE}/book`)
    expect(headerCtaFunctionHref('join', BASE)).toBe(`${BASE}/book`)
  })
})

describe('resolveHeaderCta', () => {
  it('falls back to the per-type default when unset', () => {
    expect(resolveHeaderCta(null, BASE, 'Become a member')).toEqual({
      label: 'Become a member',
      href: `${BASE}/book`,
      external: false,
    })
  })
  it('resolves a function override with its default or custom label', () => {
    expect(resolveHeaderCta({ kind: 'function', function: 'contact' }, BASE, 'x')).toEqual({
      label: 'Contact me',
      href: `${BASE}#contact`,
      external: false,
    })
    expect(resolveHeaderCta({ kind: 'function', function: 'book', label: 'Reserve' }, BASE, 'x')).toEqual({
      label: 'Reserve',
      href: `${BASE}/book`,
      external: false,
    })
  })
  it('resolves a custom override, marking an off-site URL external', () => {
    expect(resolveHeaderCta({ kind: 'custom', url: 'https://shop.io', label: 'Shop' }, BASE, 'x')).toEqual({
      label: 'Shop',
      href: 'https://shop.io',
      external: true,
    })
    expect(resolveHeaderCta({ kind: 'custom', url: '/events', label: 'Events' }, BASE, 'x')).toEqual({
      label: 'Events',
      href: '/events',
      external: false,
    })
  })
})

describe('nextHeaderCtaPreferences', () => {
  it('writes only the headerCta node, preserving other keys', () => {
    const cur = { coverScrim: 'blend', moduleMenu: { hidden: [] } }
    const next = nextHeaderCtaPreferences(cur, { kind: 'function', function: 'join' })
    expect(next).toEqual({ coverScrim: 'blend', moduleMenu: { hidden: [] }, headerCta: { kind: 'function', function: 'join' } })
  })
  it('clears the override on null, preserving other keys', () => {
    const cur = { coverScrim: 'shade', headerCta: { kind: 'custom', url: 'https://x.com', label: 'X' } }
    expect(nextHeaderCtaPreferences(cur, null)).toEqual({ coverScrim: 'shade' })
  })
})
