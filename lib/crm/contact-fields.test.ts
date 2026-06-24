import { describe, it, expect } from 'vitest'
import {
  buildContactPatch,
  isEmptyContactPatch,
  cityFromMeta,
  CONTACT_EDITABLE_FIELDS,
} from './contact-fields'

describe('buildContactPatch', () => {
  it('allowlists only the editable fields, ignoring anything else', () => {
    const patch = buildContactPatch({
      display_name: 'Jordan',
      source: 'beta_waitlist',
      // these must never reach the DB:
      email: 'attacker@example.com',
      consent_state: 'subscribed',
      engagement_score: 999,
      profile_id: 'p-1',
    } as unknown as Parameters<typeof buildContactPatch>[0])

    expect(patch.columns).toEqual({ display_name: 'Jordan', source: 'beta_waitlist' })
    expect(Object.keys(patch.columns)).not.toContain('email')
    expect(Object.keys(patch.columns)).not.toContain('consent_state')
  })

  it('trims values', () => {
    const patch = buildContactPatch({ display_name: '  Sam  ', source: ' web ' })
    expect(patch.columns).toEqual({ display_name: 'Sam', source: 'web' })
  })

  it('clears a field to null when an empty / whitespace string is submitted', () => {
    const patch = buildContactPatch({ display_name: '', source: '   ' })
    expect(patch.columns).toEqual({ display_name: null, source: null })
  })

  it('only includes a column when its key was actually supplied (partial update)', () => {
    const patch = buildContactPatch({ display_name: 'Only name' })
    expect(patch.columns).toEqual({ display_name: 'Only name' })
    expect('source' in patch.columns).toBe(false)
  })

  it('routes city to meta, not to a column', () => {
    const patch = buildContactPatch({ city: 'Encinitas' })
    expect(patch.cityProvided).toBe(true)
    expect(patch.city).toBe('Encinitas')
    expect(patch.columns).toEqual({})
  })

  it('clears city when an empty string is submitted', () => {
    const patch = buildContactPatch({ city: '  ' })
    expect(patch.cityProvided).toBe(true)
    expect(patch.city).toBeNull()
  })

  it('marks city as not provided when the key is absent', () => {
    const patch = buildContactPatch({ display_name: 'No city here' })
    expect(patch.cityProvided).toBe(false)
    expect(patch.city).toBeNull()
  })

  it('lists exactly the three safe fields and never email', () => {
    expect([...CONTACT_EDITABLE_FIELDS]).toEqual(['display_name', 'city', 'source'])
    expect(CONTACT_EDITABLE_FIELDS).not.toContain('email')
  })
})

describe('isEmptyContactPatch', () => {
  it('is empty for input with no editable keys', () => {
    expect(isEmptyContactPatch(buildContactPatch({}))).toBe(true)
    expect(isEmptyContactPatch(buildContactPatch({ email: 'x' } as Record<string, string>))).toBe(true)
  })

  it('is not empty when a column changed', () => {
    expect(isEmptyContactPatch(buildContactPatch({ display_name: 'x' }))).toBe(false)
  })

  it('is not empty when city was provided (even if cleared)', () => {
    expect(isEmptyContactPatch(buildContactPatch({ city: '' }))).toBe(false)
  })
})

describe('cityFromMeta', () => {
  it('reads city from a meta object', () => {
    expect(cityFromMeta({ city: 'Carlsbad', acquisition: { source: 'web' } })).toBe('Carlsbad')
  })

  it('returns null for missing / blank / non-string city', () => {
    expect(cityFromMeta({})).toBeNull()
    expect(cityFromMeta(null)).toBeNull()
    expect(cityFromMeta({ city: '   ' })).toBeNull()
    expect(cityFromMeta({ city: 42 })).toBeNull()
  })
})
