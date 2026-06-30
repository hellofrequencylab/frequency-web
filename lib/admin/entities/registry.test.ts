import { describe, it, expect } from 'vitest'
import {
  ENTITY_SURFACES,
  surfacesFor,
  managesEntity,
  SPACE_SURFACES,
  spaceSurfacesFor,
  type ManagedEntity,
} from './registry'
import type { Capability } from '@/lib/core/capabilities'
import type { SpaceFunctionKey } from '@/lib/spaces/functions'

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

// EM1-3: the PARALLEL Space spine. A Space is gated by the per-Space function world, not the unified
// Capability set, so `spaceSurfacesFor(type, canUse)` selects by (type offers the surface) AND (the
// caller's `canUse(fn)` predicate). These lock the practitioner + organization spines this slice
// ships, and that always-on Basics + Danger render regardless of the per-tool gate.

describe('entity registry · spaceSurfacesFor', () => {
  // A canUse predicate that grants every tool (an owner of a fully-entitled space).
  const allow = (): boolean => true
  // A canUse predicate that denies every tool (no plan / a low role): only the null-gated surfaces.
  const deny = (): boolean => false

  it('gives a practitioner the full spine in order: basics, place, people, engage, reach, comms, insights, danger', () => {
    const ids = spaceSurfacesFor('practitioner', allow).map((s) => s.id)
    expect(ids).toEqual([
      'space.basics',
      'space.place',
      'space.people',
      'space.engage.crm',
      'space.reach',
      'space.comms',
      'space.insights',
      'space.danger',
    ])
  })

  it('gives an organization the donation/enrollment + billing spine, never the practitioner-only place/CRM', () => {
    const ids = spaceSurfacesFor('organization', allow).map((s) => s.id)
    expect(ids).toEqual([
      'space.basics',
      'space.people',
      'space.engage.donations',
      'space.engage.enroll',
      'space.reach',
      'space.comms',
      'space.insights',
      'space.billing',
      'space.danger',
    ])
    // The practitioner-only surfaces never leak onto an organization.
    expect(ids).not.toContain('space.place')
    expect(ids).not.toContain('space.engage.crm')
    // And billing is an organization-spine surface this slice does not give the practitioner.
    expect(spaceSurfacesFor('practitioner', allow).map((s) => s.id)).not.toContain('space.billing')
  })

  it('falls back to only the always-on Basics + Danger when the viewer can use no tool', () => {
    expect(spaceSurfacesFor('practitioner', deny).map((s) => s.id)).toEqual(['space.basics', 'space.danger'])
    expect(spaceSurfacesFor('organization', deny).map((s) => s.id)).toEqual(['space.basics', 'space.danger'])
  })

  it('orders Basics first and Danger last regardless of which tools are on', () => {
    for (const type of ['practitioner', 'organization'] as const) {
      const ids = spaceSurfacesFor(type, allow).map((s) => s.id)
      expect(ids[0]).toBe('space.basics')
      expect(ids[ids.length - 1]).toBe('space.danger')
    }
  })

  it('passes the surface function to canUse so the caller binds the real per-Space gate', () => {
    // Only enable CRM; the practitioner spine should then include engage.crm but drop, e.g., email.
    const onlyCrm = (fn: SpaceFunctionKey): boolean => fn === 'crm'
    const ids = spaceSurfacesFor('practitioner', onlyCrm).map((s) => s.id)
    expect(ids).toContain('space.engage.crm')
    expect(ids).not.toContain('space.comms') // email gate denied
    expect(ids).toContain('space.basics') // always-on
    expect(ids).toContain('space.danger') // always-on
  })

  it('defers business / event_space / lab / partner (no spine declared yet)', () => {
    for (const type of ['business', 'event_space', 'lab', 'partner', 'coaching'] as const) {
      // The only surfaces a deferred type could match are the '*' (every-type) ones; this slice still
      // does not OFFER a console for them (the page notFound()s), but the registry would only ever
      // hand back the universal rows. Lock that none of the type-specific rows leak to them.
      const ids = spaceSurfacesFor(type, allow).map((s) => s.id)
      expect(ids).not.toContain('space.place')
      expect(ids).not.toContain('space.engage.crm')
      expect(ids).not.toContain('space.engage.donations')
      expect(ids).not.toContain('space.engage.enroll')
      expect(ids).not.toContain('space.billing')
    }
  })

  it('has unique Space surface ids', () => {
    const ids = SPACE_SURFACES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
