import { describe, it, expect } from 'vitest'
import {
  resolveMode,
  listModes,
  listVariantsForType,
  defaultVariantForType,
  modeHasFocusChoice,
  isModeVariant,
  readModePreferences,
  effectiveNavEmphasis,
  effectiveLabel,
  type ModeProfile,
} from './modes'
import type { SpaceType } from './types'

// PURE Mode registry (ADR-461/464, Space Modes plan §2b). What is locked here, all network-free (the
// resolver + the descriptors take a type/variant in, a ModeProfile out):
//   1. THE RESOLVER: an exact (type, variant) wins; a null / unknown variant falls back to the type's
//      default Focus; a type with no Mode (root) resolves to null (Mode never gates).
//   2. THE DEFAULTS: every Mode carries a non-empty pipeline, a complete lexicon, a nav emphasis, and
//      default toggles, and NONE of those reference a thing the type's function registry does not offer.
//   3. NON-GATING: the resolver returns null for a type with no preset rather than throwing, so a
//      missing Mode reads as "no preset", not "no access".

const MODE_TYPES: SpaceType[] = [
  'business',
  'coaching',
  'practitioner',
  'event_space',
  'organization',
  'lab',
]

describe('resolveMode', () => {
  it('returns the exact registered profile for a known (type, variant)', () => {
    const m = resolveMode('business', 'product')
    expect(m?.type).toBe('business')
    expect(m?.variant).toBe('product')
    expect(m?.lexicon.people).toBe('Customers')
  })

  it('falls back to the type default Focus when the variant is null', () => {
    expect(resolveMode('business', null)?.variant).toBe('service')
    expect(resolveMode('coaching', null)?.variant).toBe('packages')
    expect(resolveMode('practitioner', null)?.variant).toBe('appointments')
    expect(resolveMode('event_space', null)?.variant).toBe('ticketed')
    expect(resolveMode('organization', null)?.variant).toBe('donations')
    expect(resolveMode('lab', null)?.variant).toBe('cohort')
  })

  it('falls back to the type default Focus when the variant is unknown / out-of-mode', () => {
    expect(resolveMode('business', 'does-not-exist')?.variant).toBe('service')
    // A variant valid for ANOTHER type is not valid here, so it falls back to the default.
    expect(resolveMode('business', 'cohort')?.variant).toBe('service')
  })

  it('returns null for a type with no Mode (root / unknown) so Mode never gates', () => {
    expect(resolveMode('root', null)).toBeNull()
    expect(resolveMode(null, null)).toBeNull()
    expect(resolveMode(undefined)).toBeNull()
    expect(resolveMode('not-a-type' as SpaceType, null)).toBeNull()
  })

  it('resolves the default variant identically whether variant is null or the explicit default', () => {
    expect(resolveMode('coaching', null)).toBe(resolveMode('coaching', 'packages'))
  })
})

describe('defaultVariantForType', () => {
  it('matches the resolver fallback for every Mode type', () => {
    for (const t of MODE_TYPES) {
      const def = defaultVariantForType(t)
      expect(def).not.toBeNull()
      expect(resolveMode(t, null)?.variant).toBe(def)
    }
  })

  it('is null for a type with no Mode', () => {
    expect(defaultVariantForType('root')).toBeNull()
    expect(defaultVariantForType(null)).toBeNull()
  })
})

describe('listVariantsForType', () => {
  it('lists the default Focus first', () => {
    const variants = listVariantsForType('business')
    expect(variants[0]?.variant).toBe('service')
    expect(variants.map((v) => v.variant).sort()).toEqual(['product', 'service'])
  })

  it('is empty for a type with no Mode', () => {
    expect(listVariantsForType('root')).toEqual([])
    expect(listVariantsForType(null)).toEqual([])
  })
})

describe('modeHasFocusChoice', () => {
  it('is true for multi-Focus modes and false for single-Focus / no-Mode types', () => {
    expect(modeHasFocusChoice('business')).toBe(true)
    expect(modeHasFocusChoice('coaching')).toBe(true)
    expect(modeHasFocusChoice('lab')).toBe(false) // only one Focus
    expect(modeHasFocusChoice('root')).toBe(false)
  })
})

describe('isModeVariant', () => {
  it('recognizes registered variants and rejects everything else', () => {
    expect(isModeVariant('product')).toBe(true)
    expect(isModeVariant('packages')).toBe(true)
    expect(isModeVariant('nope')).toBe(false)
    expect(isModeVariant(null)).toBe(false)
    expect(isModeVariant(42)).toBe(false)
  })
})

describe('the ModeProfile defaults', () => {
  const all = listModes()

  it('registers a Mode for every Mode type', () => {
    for (const t of MODE_TYPES) {
      expect(all.some((m) => m.type === t)).toBe(true)
    }
  })

  it('every Mode carries a complete, non-empty preset', () => {
    for (const m of all) {
      // A non-empty, well-formed pipeline with at least one open + one terminal stage.
      expect(m.pipeline.length).toBeGreaterThan(0)
      expect(m.pipeline.some((s) => s.kind === 'open')).toBe(true)
      expect(m.pipeline.some((s) => s.kind === 'won' || s.kind === 'lost')).toBe(true)
      // A complete lexicon (no blank noun).
      for (const noun of [m.lexicon.people, m.lexicon.person, m.lexicon.offerings, m.lexicon.offering]) {
        expect(noun.trim().length).toBeGreaterThan(0)
      }
      // A non-empty nav emphasis + at least one next-best-action.
      expect(m.navEmphasis.length).toBeGreaterThan(0)
      expect(m.nextBestActions.length).toBeGreaterThan(0)
      // Labels are plain (no em dashes, CONTENT-VOICE §10).
      for (const s of [m.modeLabel, m.focusLabel, m.tagline]) {
        expect(s.includes('—')).toBe(false)
        expect(s.includes('–')).toBe(false)
      }
    }
  })

  it('default toggles are a subset of the nav emphasis (you lead with what you turn on)', () => {
    for (const m of all) {
      for (const t of m.defaultToggles) {
        expect(m.navEmphasis.includes(t)).toBe(true)
      }
    }
  })

  it('recommended add-ons are known catalog keys', () => {
    const known = new Set(['marketing', 'ai', 'team', 'branding'])
    for (const m of all) {
      for (const a of m.recommendedAddons) expect(known.has(a)).toBe(true)
    }
  })

  it('every (type, variant) key is unique', () => {
    const keys = all.map((m: ModeProfile) => `${m.type}:${m.variant}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('readModePreferences', () => {
  it('is {} for any malformed / empty blob', () => {
    expect(readModePreferences(null)).toEqual({})
    expect(readModePreferences('nope')).toEqual({})
    expect(readModePreferences({})).toEqual({})
    expect(readModePreferences({ mode: 'nope' })).toEqual({})
    expect(readModePreferences([])).toEqual({})
  })

  it('reads valid label / toggle / navOrder overrides and drops unknown keys + bad values', () => {
    const prefs = readModePreferences({
      mode: {
        labels: { crm: 'Pipeline', members: '  ', bogus: 'x', email: 42 },
        toggles: { availability: true, qr: false, bogus: true, members: 'yes' },
        navOrder: ['crm', 'availability', 'bogus', 7],
      },
    })
    expect(prefs.labels).toEqual({ crm: 'Pipeline' })
    expect(prefs.toggles).toEqual({ availability: true, qr: false })
    expect(prefs.navOrder).toEqual(['crm', 'availability'])
  })
})

describe('effectiveNavEmphasis (operator overrides win)', () => {
  it('falls back to the Mode emphasis with no overrides', () => {
    const mode = resolveMode('coaching', 'packages')
    expect(effectiveNavEmphasis(mode, {})).toEqual(mode?.navEmphasis)
  })

  it('a hand-sorted navOrder wins over the Mode emphasis', () => {
    const mode = resolveMode('coaching', 'packages')
    expect(effectiveNavEmphasis(mode, { navOrder: ['crm', 'qr'] })).toEqual(['crm', 'qr'])
  })

  it('a toggle-OFF removes a module and a toggle-ON appends one', () => {
    const mode = resolveMode('practitioner', 'appointments') // ['availability','crm','members','email','qr']
    const out = effectiveNavEmphasis(mode, { toggles: { availability: false, tickets: true } })
    expect(out).not.toContain('availability')
    expect(out).toContain('tickets')
  })

  it('is [] for a null mode with no overrides (no preset = no emphasis)', () => {
    expect(effectiveNavEmphasis(null, {})).toEqual([])
  })
})

describe('effectiveLabel', () => {
  it('returns the override when set, else null (caller uses the registry label)', () => {
    expect(effectiveLabel({ labels: { crm: 'Pipeline' } }, 'crm')).toBe('Pipeline')
    expect(effectiveLabel({}, 'crm')).toBeNull()
  })
})
