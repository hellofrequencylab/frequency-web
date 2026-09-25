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
  it('keeps the transactional keys on /book', () => {
    expect(headerCtaFunctionHref('book', BASE)).toBe(`${BASE}/book`)
    expect(headerCtaFunctionHref('tickets', BASE)).toBe(`${BASE}/book`)
    expect(headerCtaFunctionHref('donate', BASE)).toBe(`${BASE}/book`)
  })

  // Owner instruction 2026-09-25: "make the Contact me button go to the Contact page by default."
  // It jumped to the Home #contact anchor, which is the FACTS card alone, while the Contact tab
  // (LIVE-502) carries the operator's own form AND those facts. The one button a Space gets was
  // landing on the smaller half of its own contact surface.
  it('opens the contact PAGE, not the Home anchor', () => {
    expect(headerCtaFunctionHref('contact', BASE)).toBe(`${BASE}/contact`)
  })

  // `offerings` stays an anchor, and the asymmetry is asserted rather than left to be discovered:
  // there is no /offerings page to open, so a sweep that "finished the job" by pointing it at one
  // would produce a 404 for every Space that stores the key.
  it('leaves offerings on the Home anchor, because no /offerings page exists', () => {
    expect(headerCtaFunctionHref('offerings', BASE)).toBe(`${BASE}#offerings`)
  })

  // The hints are what the operator reads in the picker, and each one is a claim about where the
  // button goes. A key that opens a page says "Opens"; the one that scrolls says "Jumps to". This
  // pins the pairing, because the `join` defect was exactly a hint that outlived its href.
  it('describes each key the way it actually behaves', () => {
    for (const choice of HEADER_CTA_FUNCTIONS) {
      const scrolls = headerCtaFunctionHref(choice.key, BASE).includes('#')
      expect(choice.hint.startsWith(scrolls ? 'Jumps to' : 'Opens'), `${choice.key}: ${choice.hint}`).toBe(true)
    }
  })

  // LIVE-509. `join` asserted `/book` here, and that was the defect written down as a contract:
  // its own picker hint says "Opens your membership page", but `/book` renders the widget the
  // Space's FOCUS resolves to, so on an appointments Focus a button labelled "Join" opened a
  // booking slot picker. Both keys now open the tab whose name they carry, on every Space.
  it('opens the memberships tab for both membership keys, whatever the Focus', () => {
    expect(headerCtaFunctionHref('join', BASE)).toBe(`${BASE}/memberships`)
    expect(headerCtaFunctionHref('memberships', BASE)).toBe(`${BASE}/memberships`)
  })

  // Every registered key resolves to a real, non-empty path off the base. A key added to the union
  // without an arm is a TypeScript error, but a key added with a WRONG arm is not, so this walks
  // the offered list rather than restating it.
  it('resolves every offered function to a path under the base', () => {
    for (const choice of HEADER_CTA_FUNCTIONS) {
      const href = headerCtaFunctionHref(choice.key, BASE)
      expect(href.startsWith(BASE)).toBe(true)
      expect(href.length).toBeGreaterThan(BASE.length)
    }
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
      href: `${BASE}/contact`,
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
