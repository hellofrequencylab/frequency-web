import { describe, it, expect } from 'vitest'
import {
  SPACE_KINDS,
  DEFAULT_SPACE_KIND,
  isSpaceKind,
  normalizeSpaceKind,
  spaceKindLabel,
} from './categories'

// The Space KIND taxonomy (lib/spaces/categories.ts, ADR-887: the old "directory category" renamed to
// the KIND axis — what SHAPE of thing a Space is). What is locked here:
//   1. Exactly SIX kinds, business first (the catch-all default), each with a label + blurb + Icon.
//   2. The KEYS are the SAME six the legacy category vocabulary used — the rename never invalidates a
//      stored row (only the jsonb key moves, via scripts/adr-887-space-kind-migration.sql).
//   3. The guard (isSpaceKind) accepts only the closed key set.
//   4. normalizeSpaceKind coerces anything unknown / empty / malformed to 'business'.
//   5. spaceKindLabel maps a key to its member-facing label (default for unknown), with `coach`
//      relabeled to "Guides / Coaches" (owner's phrasing, ADR-887).
//   6. Copy passes CONTENT-VOICE §10 (no em dashes anywhere in labels or blurbs).

describe('SPACE_KINDS', () => {
  it('has exactly six kinds, business first, on the UNCHANGED legacy keys', () => {
    expect(SPACE_KINDS).toHaveLength(6)
    expect(SPACE_KINDS[0].key).toBe('business')
    expect(SPACE_KINDS.map((k) => k.key)).toEqual([
      'business',
      'practitioner',
      'coach',
      'studio',
      'maker',
      'venue',
    ])
  })

  it('covers the owner-named labels, coach relabeled to Guides / Coaches', () => {
    const byKey = Object.fromEntries(SPACE_KINDS.map((k) => [k.key, k.label]))
    expect(byKey).toMatchObject({
      business: 'Business',
      practitioner: 'Practitioner',
      coach: 'Guides / Coaches',
      studio: 'Studios',
      maker: 'Shops',
      venue: 'Event Space',
    })
  })

  it('gives every kind a label, a blurb, and an Icon', () => {
    for (const k of SPACE_KINDS) {
      expect(k.label.length).toBeGreaterThan(0)
      expect(k.blurb.length).toBeGreaterThan(0)
      expect(k.Icon).toBeTruthy() // a lucide icon (a forwardRef component)
    }
  })

  it('uses no em dashes in any label or blurb (CONTENT-VOICE §10)', () => {
    for (const k of SPACE_KINDS) {
      expect(k.label).not.toContain('—')
      expect(k.blurb).not.toContain('—')
    }
  })

  it('exposes business as the default', () => {
    expect(DEFAULT_SPACE_KIND).toBe('business')
  })
})

describe('isSpaceKind', () => {
  it('accepts every known key', () => {
    for (const k of SPACE_KINDS) expect(isSpaceKind(k.key)).toBe(true)
  })

  it('rejects unknown / non-string values (subjects are NOT kinds)', () => {
    for (const v of ['nonprofit', 'root', 'BUSINESS', 'meditation', 'movement', '', ' ', 'x', null, undefined, 3, {}]) {
      expect(isSpaceKind(v)).toBe(false)
    }
  })
})

describe('normalizeSpaceKind', () => {
  it('passes known keys through', () => {
    expect(normalizeSpaceKind('practitioner')).toBe('practitioner')
    expect(normalizeSpaceKind('venue')).toBe('venue')
  })

  it('coerces unknown / empty / malformed to business', () => {
    for (const v of ['', ' ', 'nope', 'Business', null, undefined, 42, {}, []]) {
      expect(normalizeSpaceKind(v)).toBe('business')
    }
  })
})

describe('spaceKindLabel', () => {
  it('maps a known key to its label', () => {
    expect(spaceKindLabel('coach')).toBe('Guides / Coaches')
    expect(spaceKindLabel('maker')).toBe('Shops')
  })

  it('falls back to the default label for an unknown key', () => {
    expect(spaceKindLabel('bogus')).toBe('Business')
    expect(spaceKindLabel(undefined)).toBe('Business')
  })
})
