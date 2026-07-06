import { describe, it, expect } from 'vitest'
import {
  ENTITY_SURFACES,
  surfacesFor,
  managesEntity,
  type ManagedEntity,
} from './registry'
import type { Capability } from '@/lib/core/capabilities'

// The SPACE menu is no longer declared here. It converged onto the ONE module system
// (lib/admin/modules/space-modules.ts SPACE_MODULES + spaceModuleManifest, ADR-547);
// its catalog/gating/tier/placement contract is locked by lib/admin/modules/space-modules.test.ts.
// This file now only exercises the core Scope/Capability ENTITY_SURFACES path.

// EM1-1 / EM1-3: the entity registry's selection is pure — which surfaces a viewer sees
// is (entity × the capabilities they hold for that scope), filtered + spine-ordered.
// These lock that contract for the Pass-1 surfaces (circle, plus the EM1-3 rollout onto
// hub, nexus, event, practice).

// Each Pass-1 entity, the capability that gates it, and the surface ids it should yield.
const ENTITY_CASES: ReadonlyArray<{
  entity: ManagedEntity
  cap: Capability
  ids: string[]
}> = [
  { entity: 'circle', cap: 'circle.editSettings', ids: ['circle.basics', 'circle.danger'] },
  { entity: 'hub', cap: 'hub.manage', ids: ['hub.basics', 'hub.danger'] },
  { entity: 'nexus', cap: 'nexus.manage', ids: ['nexus.basics', 'nexus.danger'] },
  { entity: 'event', cap: 'event.editSettings', ids: ['event.basics', 'event.danger'] },
  { entity: 'practice', cap: 'practice.editSettings', ids: ['practice.basics', 'practice.danger'] },
]

describe('entity registry · surfacesFor', () => {
  for (const { entity, cap, ids } of ENTITY_CASES) {
    it(`surfaces ${entity} Basics + Danger to a viewer holding ${cap}`, () => {
      const caps = new Set<Capability>([cap])
      expect(surfacesFor(entity, caps).map((s) => s.id)).toEqual(ids)
      expect(managesEntity(entity, caps)).toBe(true)
    })

    it(`hides every ${entity} surface from a viewer without ${cap}`, () => {
      const caps = new Set<Capability>(['circle.view'])
      expect(surfacesFor(entity, caps)).toHaveLength(0)
      expect(managesEntity(entity, caps)).toBe(false)
    })

    it(`returns ${entity} surfaces ordered by the spine (basics before danger)`, () => {
      const slots = surfacesFor(entity, new Set<Capability>([cap])).map((s) => s.slot)
      expect(slots.indexOf('basics')).toBeLessThan(slots.indexOf('danger'))
    })
  }

  it('treats an empty capability set as "does not manage"', () => {
    expect(surfacesFor('circle', new Set<Capability>())).toHaveLength(0)
    expect(managesEntity('circle', new Set<Capability>())).toBe(false)
  })

  it('does not leak one entity’s gate onto another entity', () => {
    // Holding the circle gate must surface ONLY circle's rows — never hub/nexus/event/
    // practice, each of which is gated by its own capability.
    const circleOnly = new Set<Capability>(['circle.editSettings'])
    expect(surfacesFor('hub', circleOnly)).toHaveLength(0)
    expect(surfacesFor('nexus', circleOnly)).toHaveLength(0)
    expect(surfacesFor('event', circleOnly)).toHaveLength(0)
    expect(surfacesFor('practice', circleOnly)).toHaveLength(0)

    // And the hub gate must not surface circle's rows.
    const hubOnly = new Set<Capability>(['hub.manage'])
    expect(surfacesFor('circle', hubOnly)).toHaveLength(0)
    expect(surfacesFor('hub', hubOnly).map((s) => s.id)).toEqual(['hub.basics', 'hub.danger'])
  })

  it('does not surface anything for an entity that has no declared surfaces', () => {
    // `channel` and `profile` are valid Scope kinds but carry no entity-console surfaces
    // in Pass 1 — they must come back empty regardless of caps.
    const caps = new Set<Capability>(['channel.manage', 'profile.edit', 'circle.editSettings'])
    expect(surfacesFor('channel', caps)).toHaveLength(0)
    expect(surfacesFor('profile', caps)).toHaveLength(0)
  })

  it('has unique surface ids, each gated by a real capability', () => {
    const ids = ENTITY_SURFACES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    // Every declared surface names a capability (no ungated surface can exist).
    expect(ENTITY_SURFACES.every((s) => typeof s.requiredCapability === 'string')).toBe(true)
    // Every declared entity is one of the Pass-1 managed entities (a real Scope kind).
    const allowed = new Set<ManagedEntity>(['circle', 'hub', 'nexus', 'event', 'practice'])
    expect(ENTITY_SURFACES.every((s) => allowed.has(s.entity))).toBe(true)
  })

  it('declares exactly Basics + Danger for each Pass-1 entity', () => {
    for (const { entity } of ENTITY_CASES) {
      const slots = ENTITY_SURFACES.filter((s) => s.entity === entity)
        .map((s) => s.slot)
        .sort()
      expect(slots).toEqual(['basics', 'danger'])
    }
  })
})
