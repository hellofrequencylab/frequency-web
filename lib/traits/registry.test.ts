import { describe, it, expect } from 'vitest'
import { TRAIT_REGISTRY, TAGS, getTrait, isTagKey } from './registry'

describe('trait registry', () => {
  it('has unique keys', () => {
    const keys = TRAIT_REGISTRY.map((t) => t.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('keys are snake_case slugs (stable for storage)', () => {
    for (const t of TRAIT_REGISTRY) expect(t.key).toMatch(/^[a-z][a-z0-9_]*$/)
  })

  it('every entry carries governance metadata (label, owner, pii, freshness)', () => {
    for (const t of TRAIT_REGISTRY) {
      expect(t.label.length).toBeGreaterThan(0)
      expect(t.owner.length).toBeGreaterThan(0)
      expect(['none', 'identity', 'sensitive']).toContain(t.pii)
      expect(['static', 'nightly', 'realtime']).toContain(t.freshness)
    }
  })

  it('computed traits declare a derivation; enums declare values', () => {
    for (const t of TRAIT_REGISTRY) {
      if (t.kind === 'computed') expect(t.derivation, `${t.key} needs a derivation`).toBeTruthy()
      if (t.type === 'enum') expect(t.values?.length, `${t.key} needs enum values`).toBeGreaterThan(0)
    }
  })

  it('web_beta is a registered, system-managed tag', () => {
    const wb = getTrait('web_beta')
    expect(wb?.kind).toBe('tag')
    expect(wb?.systemManaged).toBe(true)
    expect(isTagKey('web_beta')).toBe(true)
  })

  it('isTagKey rejects computed traits and unknown keys', () => {
    expect(isTagKey('lifecycle_stage')).toBe(false) // computed, not a tag
    expect(isTagKey('not_a_real_key')).toBe(false)
  })

  it('TAGS is exactly the tag-kind subset', () => {
    expect(TAGS.every((t) => t.kind === 'tag')).toBe(true)
    expect(TAGS.length).toBe(TRAIT_REGISTRY.filter((t) => t.kind === 'tag').length)
  })
})
