import { describe, it, expect } from 'vitest'
import {
  SPACE_CATEGORIES,
  DEFAULT_SPACE_CATEGORY,
  isSpaceCategory,
  normalizeSpaceCategory,
  spaceCategoryLabel,
} from './categories'

// The PUBLIC directory category taxonomy (lib/spaces/categories.ts). What is locked here:
//   1. Exactly SIX categories, business first (the catch-all default), each with a label + blurb + Icon.
//   2. The guard (isSpaceCategory) accepts only the closed key set.
//   3. normalizeSpaceCategory coerces anything unknown / empty / malformed to 'business'.
//   4. spaceCategoryLabel maps a key to its member-facing label (default for unknown).
//   5. Copy passes CONTENT-VOICE §10 (no em dashes anywhere in labels or blurbs).

describe('SPACE_CATEGORIES', () => {
  it('has exactly six categories, business first', () => {
    expect(SPACE_CATEGORIES).toHaveLength(6)
    expect(SPACE_CATEGORIES[0].key).toBe('business')
    expect(SPACE_CATEGORIES.map((c) => c.key)).toEqual([
      'business',
      'practitioner',
      'coach',
      'studio',
      'maker',
      'venue',
    ])
  })

  it('covers the owner-named labels', () => {
    const byKey = Object.fromEntries(SPACE_CATEGORIES.map((c) => [c.key, c.label]))
    expect(byKey).toMatchObject({
      business: 'Business',
      practitioner: 'Practitioner',
      coach: 'Coach & Guide',
      studio: 'Studios',
      maker: 'Shops',
      venue: 'Event Space',
    })
  })

  it('gives every category a label, a blurb, and an Icon', () => {
    for (const c of SPACE_CATEGORIES) {
      expect(c.label.length).toBeGreaterThan(0)
      expect(c.blurb.length).toBeGreaterThan(0)
      expect(c.Icon).toBeTruthy() // a lucide icon (a forwardRef component)
    }
  })

  it('uses no em dashes in any label or blurb (CONTENT-VOICE §10)', () => {
    for (const c of SPACE_CATEGORIES) {
      expect(c.label).not.toContain('—')
      expect(c.blurb).not.toContain('—')
    }
  })

  it('exposes business as the default', () => {
    expect(DEFAULT_SPACE_CATEGORY).toBe('business')
  })
})

describe('isSpaceCategory', () => {
  it('accepts every known key', () => {
    for (const c of SPACE_CATEGORIES) expect(isSpaceCategory(c.key)).toBe(true)
  })

  it('rejects unknown / non-string values', () => {
    for (const v of ['nonprofit', 'root', 'BUSINESS', '', ' ', 'x', null, undefined, 3, {}]) {
      expect(isSpaceCategory(v)).toBe(false)
    }
  })
})

describe('normalizeSpaceCategory', () => {
  it('passes known keys through', () => {
    expect(normalizeSpaceCategory('practitioner')).toBe('practitioner')
    expect(normalizeSpaceCategory('venue')).toBe('venue')
  })

  it('coerces unknown / empty / malformed to business', () => {
    for (const v of ['', ' ', 'nope', 'Business', null, undefined, 42, {}, []]) {
      expect(normalizeSpaceCategory(v)).toBe('business')
    }
  })
})

describe('spaceCategoryLabel', () => {
  it('maps a known key to its label', () => {
    expect(spaceCategoryLabel('coach')).toBe('Coach & Guide')
    expect(spaceCategoryLabel('maker')).toBe('Shops')
  })

  it('falls back to the default label for an unknown key', () => {
    expect(spaceCategoryLabel('bogus')).toBe('Business')
    expect(spaceCategoryLabel(undefined)).toBe('Business')
  })
})
