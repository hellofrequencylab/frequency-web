import { describe, it, expect } from 'vitest'
import {
  ENTITY_SURFACES,
  surfacesFor,
  managesEntity,
  type ManagedEntity,
} from './registry'
import type { Capability } from '@/lib/core/capabilities'

// EM1-1: the entity registry's selection is pure — which surfaces a viewer sees is
// (entity × the capabilities they hold for that scope), filtered + spine-ordered.
// These lock that contract for the Pass-1 circle surfaces.

describe('entity registry · surfacesFor', () => {
  it('surfaces circle Basics + Danger to a viewer holding circle.editSettings', () => {
    const caps = new Set<Capability>(['circle.view', 'circle.editSettings'])
    expect(surfacesFor('circle', caps).map((s) => s.id)).toEqual([
      'circle.basics',
      'circle.danger',
    ])
    expect(managesEntity('circle', caps)).toBe(true)
  })

  it('hides every circle surface from a viewer without the capability', () => {
    const caps = new Set<Capability>(['circle.view'])
    expect(surfacesFor('circle', caps)).toHaveLength(0)
    expect(managesEntity('circle', caps)).toBe(false)
  })

  it('treats an empty capability set as "does not manage"', () => {
    expect(surfacesFor('circle', new Set<Capability>())).toHaveLength(0)
    expect(managesEntity('circle', new Set<Capability>())).toBe(false)
  })

  it('does not surface circle modules for a different entity type', () => {
    const caps = new Set<Capability>(['circle.editSettings'])
    // Pass 1 only declares circle surfaces, so any other entity is empty — and the
    // circle gate must never leak onto another entity.
    expect(surfacesFor('hub', caps)).toHaveLength(0)
    expect(surfacesFor('event', caps)).toHaveLength(0)
  })

  it('returns surfaces ordered by the spine (basics before danger)', () => {
    const caps = new Set<Capability>(['circle.editSettings'])
    const slots = surfacesFor('circle', caps).map((s) => s.slot)
    expect(slots.indexOf('basics')).toBeLessThan(slots.indexOf('danger'))
  })

  it('has unique surface ids, each gated by a real capability', () => {
    const ids = ENTITY_SURFACES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    // Every declared surface names a capability (no ungated surface can exist).
    expect(ENTITY_SURFACES.every((s) => typeof s.requiredCapability === 'string')).toBe(true)
    // The entity discriminant is a real Scope kind.
    const entities: ManagedEntity[] = ENTITY_SURFACES.map((s) => s.entity)
    expect(entities.every((e) => e === 'circle')).toBe(true)
  })
})
