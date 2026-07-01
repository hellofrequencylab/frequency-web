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
describe('profile-config defaults', () => {
  it('maps each role to its distinct legacy accent token, host amber for unknown', () => {
    expect(defaultAccentForType('practitioner')).toBe('--color-primary')
    expect(defaultAccentForType('business')).toBe('--color-broadcast')
    expect(defaultAccentForType('organization')).toBe('--color-signal')
    expect(defaultAccentForType('coaching')).toBe('--color-info')
    expect(defaultAccentForType('event_space')).toBe('--color-warning')
    expect(defaultAccentForType('lab')).toBe('--color-success')
    expect(defaultAccentForType('partner')).toBe('--color-broadcast')
    expect(defaultAccentForType('root')).toBe(HOST_ACCENT)
    expect(defaultAccentForType('nonsense')).toBe(HOST_ACCENT)
  })

  it('every default accent is a DAWN token, never a hex', () => {
    for (const type of ['practitioner', 'business', 'organization', 'coaching', 'event_space', 'lab', 'partner']) {
      expect(defaultAccentForType(type)).toMatch(/^--color-/)
    }
  })

  it('maps each role to a plain-verb primary-CTA label, a safe default for unknown', () => {
    expect(defaultPrimaryCtaLabel('practitioner')).toBe('Book')
    expect(defaultPrimaryCtaLabel('organization')).toBe('Donate')
    expect(defaultPrimaryCtaLabel('event_space')).toBe('Get tickets')
    expect(defaultPrimaryCtaLabel('nonsense')).toBe('Get started')
    // No em dashes in any label (CONTENT-VOICE).
    for (const type of ['practitioner', 'business', 'organization', 'coaching', 'event_space', 'lab', 'partner']) {
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
    for (const type of ['practitioner', 'business', 'organization', 'coaching', 'event_space', 'lab', 'partner']) {
      expect(SUPPORTED_ACCENT_TOKENS.has(defaultAccentForType(type))).toBe(true)
    }
  })

  it('assigns a DISTINCT default accent to each of the five core roles (§1)', () => {
    // lib/spaces/accent.ts ships exactly six accent families; the five core roles take one each. Lab
    // takes the last free family (success); Partner shares the Business brand family by design.
    const core = ['practitioner', 'business', 'organization', 'coaching', 'event_space'] as const
    const accents = core.map((r) => defaultAccentForType(r))
    expect(new Set(accents).size).toBe(core.length)
    expect(defaultAccentForType('lab')).toBe('--color-success')
    expect(defaultAccentForType('partner')).toBe(defaultAccentForType('business'))
  })
})

// ── The re-homed PROVISIONABLE-types helper (was the blueprint registry, ADR-339 + ADR-341) ────────
describe('provisionable Space types', () => {
  it('lists exactly the seven member-facing types the create wizard offers, in canonical order', () => {
    expect(provisionableTypes()).toEqual([
      { value: 'practitioner', label: 'Practitioner' },
      { value: 'business', label: 'Business' },
      { value: 'organization', label: 'Organization' },
      { value: 'coaching', label: 'Coaching' },
      { value: 'event_space', label: 'Event Space' },
      { value: 'lab', label: 'Lab' },
      { value: 'partner', label: 'Partner' },
    ])
  })

  it('returns a fresh array each call (no shared-reference mutation)', () => {
    const a = provisionableTypes()
    const b = provisionableTypes()
    expect(a).not.toBe(b)
    expect(a[0]).not.toBe(b[0])
  })

  it('isProvisionableType accepts every provisionable type and lab + partner', () => {
    for (const t of provisionableTypes()) expect(isProvisionableType(t.value)).toBe(true)
    expect(isProvisionableType('lab')).toBe(true)
    expect(isProvisionableType('partner')).toBe(true)
  })

  it('isProvisionableType fails CLOSED for root, an unknown type, and null/undefined', () => {
    expect(isProvisionableType('root')).toBe(false)
    expect(isProvisionableType('school')).toBe(false)
    expect(isProvisionableType('unknown')).toBe(false)
    expect(isProvisionableType('')).toBe(false)
    expect(isProvisionableType(null)).toBe(false)
    expect(isProvisionableType(undefined)).toBe(false)
  })

  it('provisions new Spaces on the curated DAWN skin', () => {
    expect(DEFAULT_SPACE_SKIN).toBe('dawn')
  })
})
