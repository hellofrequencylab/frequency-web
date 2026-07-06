import { describe, it, expect } from 'vitest'
import {
  defaultAccentForType,
  defaultPrimaryCtaLabel,
  defaultHeroStats,
  provisionableTypes,
  isProvisionableType,
  DEFAULT_SPACE_SKIN,
  HOST_ACCENT,
  DEFAULT_HERO_STATS,
} from './profile-config'
import { SUPPORTED_ACCENT_TOKENS } from './accent'

// The small per-type default lookups that survive the template system's removal. Defaults
// only — operator choices override elsewhere. Tokens, never hex; the five roles read distinct.
// After the ADR-552 collapse the only public types are `business` and `nonprofit` (+ the hidden `root`).
const PUBLIC_TYPES = ['business', 'nonprofit'] as const

describe('profile-config defaults', () => {
  it('maps each type to its distinct accent token, host amber for root / unknown', () => {
    expect(defaultAccentForType('business')).toBe('--color-broadcast')
    expect(defaultAccentForType('nonprofit')).toBe('--color-signal')
    expect(defaultAccentForType('root')).toBe(HOST_ACCENT)
    expect(defaultAccentForType('nonsense')).toBe(HOST_ACCENT)
  })

  it('every default accent is a DAWN token, never a hex', () => {
    for (const type of PUBLIC_TYPES) {
      expect(defaultAccentForType(type)).toMatch(/^--color-/)
    }
  })

  it('maps each type to a plain-verb primary-CTA label, a safe default for unknown', () => {
    expect(defaultPrimaryCtaLabel('business')).toBe('Become a member')
    expect(defaultPrimaryCtaLabel('nonprofit')).toBe('Donate')
    expect(defaultPrimaryCtaLabel('nonsense')).toBe('Get started')
    // No em dashes in any label (CONTENT-VOICE).
    for (const type of PUBLIC_TYPES) {
      expect(defaultPrimaryCtaLabel(type)).not.toContain('—')
    }
  })

  it('returns a fresh, non-empty default hero stat set each call (no shared mutation)', () => {
    const a = defaultHeroStats()
    const b = defaultHeroStats()
    expect(a).toEqual([...DEFAULT_HERO_STATS])
    expect(a).not.toBe(b)
    a.push('members')
    expect(defaultHeroStats()).toEqual([...DEFAULT_HERO_STATS])
  })

  it('every default accent is a token the accent layer can paint (never falls back to host amber)', () => {
    for (const type of PUBLIC_TYPES) {
      expect(SUPPORTED_ACCENT_TOKENS.has(defaultAccentForType(type))).toBe(true)
    }
  })

  it('assigns a DISTINCT default accent to each of the two public types', () => {
    const accents = PUBLIC_TYPES.map((r) => defaultAccentForType(r))
    expect(new Set(accents).size).toBe(PUBLIC_TYPES.length)
  })
})

// ── The re-homed PROVISIONABLE-types helper (was the blueprint registry, ADR-339 + ADR-341) ────────
describe('provisionable Space types', () => {
  it('lists exactly the two member-facing types the create wizard offers, in canonical order', () => {
    expect(provisionableTypes()).toEqual([
      { value: 'business', label: 'Business' },
      { value: 'nonprofit', label: 'Non Profit' },
    ])
  })

  it('returns a fresh array each call (no shared-reference mutation)', () => {
    const a = provisionableTypes()
    const b = provisionableTypes()
    expect(a).not.toBe(b)
    expect(a[0]).not.toBe(b[0])
  })

  it('isProvisionableType accepts every provisionable type', () => {
    for (const t of provisionableTypes()) expect(isProvisionableType(t.value)).toBe(true)
    expect(isProvisionableType('business')).toBe(true)
    expect(isProvisionableType('nonprofit')).toBe(true)
  })

  it('isProvisionableType fails CLOSED for root, the retired types, an unknown type, and null/undefined', () => {
    expect(isProvisionableType('root')).toBe(false)
    // The retired public types folded into Business (ADR-552); they are no longer provisionable values.
    expect(isProvisionableType('practitioner')).toBe(false)
    expect(isProvisionableType('coaching')).toBe(false)
    expect(isProvisionableType('lab')).toBe(false)
    expect(isProvisionableType('partner')).toBe(false)
    expect(isProvisionableType('school')).toBe(false)
    expect(isProvisionableType('')).toBe(false)
    expect(isProvisionableType(null)).toBe(false)
    expect(isProvisionableType(undefined)).toBe(false)
  })

  it('provisions new Spaces on the curated DAWN skin', () => {
    expect(DEFAULT_SPACE_SKIN).toBe('dawn')
  })
})
