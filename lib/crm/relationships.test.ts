import { describe, it, expect } from 'vitest'
import {
  RELATIONSHIP_KINDS,
  isRelationshipKind,
  isAssignableKind,
  relationshipKind,
  relationshipLabel,
  assignableKinds,
  derivedKinds,
} from './relationships'

describe('RELATIONSHIP_KINDS registry', () => {
  it('has both categories with the expected keys', () => {
    const derived = derivedKinds().map((k) => k.key).sort()
    const assignable = assignableKinds().map((k) => k.key).sort()
    expect(derived).toEqual(['business', 'lead', 'member', 'subscriber'])
    expect(assignable).toEqual(['donor', 'labs_member', 'partner', 'vendor', 'volunteer'])
  })

  it('every entry carries a voice-safe label (no em dash) + a tone + a description', () => {
    for (const k of RELATIONSHIP_KINDS) {
      expect(k.label.length).toBeGreaterThan(0)
      expect(k.label).not.toMatch(/[—–]/)
      expect(k.description.length).toBeGreaterThan(0)
      expect(['neutral', 'primary', 'success', 'warning', 'danger']).toContain(k.tone)
    }
  })

  it('keys are unique', () => {
    const keys = RELATIONSHIP_KINDS.map((k) => k.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('kind helpers', () => {
  it('isRelationshipKind narrows known keys and rejects the rest', () => {
    expect(isRelationshipKind('donor')).toBe(true)
    expect(isRelationshipKind('member')).toBe(true)
    expect(isRelationshipKind('nope')).toBe(false)
    expect(isRelationshipKind(null)).toBe(false)
    expect(isRelationshipKind(undefined)).toBe(false)
  })

  it('isAssignableKind accepts only assignable kinds (never derived / unknown)', () => {
    expect(isAssignableKind('donor')).toBe(true)
    expect(isAssignableKind('volunteer')).toBe(true)
    // derived kinds are computed, never stored:
    expect(isAssignableKind('member')).toBe(false)
    expect(isAssignableKind('business')).toBe(false)
    expect(isAssignableKind('unknown')).toBe(false)
    expect(isAssignableKind(null)).toBe(false)
  })

  it('relationshipKind returns the def or undefined', () => {
    expect(relationshipKind('partner')?.label).toBe('Partner')
    expect(relationshipKind('missing')).toBeUndefined()
  })

  it('relationshipLabel falls back to the raw key, never throwing', () => {
    expect(relationshipLabel('labs_member')).toBe('Lab member')
    expect(relationshipLabel('mystery')).toBe('mystery')
    expect(relationshipLabel(null)).toBe('')
  })
})
