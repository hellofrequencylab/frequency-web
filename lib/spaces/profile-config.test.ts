import { describe, it, expect } from 'vitest'
import {
  defaultAccentForType,
  defaultPrimaryCtaLabel,
  defaultHeroStats,
  HOST_ACCENT,
  DEFAULT_HERO_STATS,
} from './profile-config'

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
})
