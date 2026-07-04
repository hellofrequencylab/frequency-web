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

// EM1-3 / EM2-3: the PARALLEL Space spine. A Space is gated by the per-Space function world, not the
// unified Capability set, so `spaceSurfacesFor(type, canUse)` selects by (type offers the surface)
// AND (the caller's `canUse(fn)` predicate). These lock every provisionable type's spine (the console
// serves all but coaching), and that always-on Basics + Danger render regardless of the per-tool gate.

describe('entity registry · spaceSurfacesFor', () => {
  // A canUse predicate that grants every tool (an owner of a fully-entitled space).
  const allow = (): boolean => true
  // A canUse predicate that denies every tool (no plan / a low role): only the null-gated surfaces.
  const deny = (): boolean => false

  // THE DEEPER OFFERINGS MERGE: the five separate commerce surfaces (place / memberships / donations /
  // enroll / tickets / checkin) collapsed into the ONE adaptive `space.offerings` surface (engage slot).
  // It shows only when the type has an offering the viewer can use, and it sorts in the engage slot
  // BEFORE CRM (declaration order within the shared slot).

  it('gives a practitioner the full spine in order: basics, mode, people, layout, offerings, CRM, services, reach, comms, insights, danger', () => {
    const ids = spaceSurfacesFor('practitioner', allow).map((s) => s.id)
    expect(ids).toEqual([
      'space.basics',
      'space.mode',
      'space.people',
      'space.layout',
      'space.offerings',
      'space.engage.crm',
      'space.services',
      'space.reach',
      'space.comms',
      'space.insights',
      'space.danger',
    ])
    // The old individual commerce surface ids are gone; Offerings carries them now.
    expect(ids).not.toContain('space.place')
    // Services (the storefront store items) sorts right AFTER CRM within the shared engage slot.
    expect(ids.indexOf('space.services')).toBe(ids.indexOf('space.engage.crm') + 1)
  })

  it('gives an organization the Offerings (donations + enrollment) + billing spine, never the practitioner-only CRM', () => {
    const ids = spaceSurfacesFor('organization', allow).map((s) => s.id)
    expect(ids).toEqual([
      'space.basics',
      'space.mode',
      'space.people',
      'space.layout',
      'space.offerings',
      'space.services',
      'space.reach',
      'space.comms',
      'space.insights',
      'space.billing',
      'space.danger',
    ])
    // CRM is not an organization surface, and the old individual commerce ids are gone.
    expect(ids).not.toContain('space.engage.crm')
    expect(ids).not.toContain('space.engage.donations')
    expect(ids).not.toContain('space.engage.enroll')
    // And billing is an organization-spine surface this slice does not give the practitioner.
    expect(spaceSurfacesFor('practitioner', allow).map((s) => s.id)).not.toContain('space.billing')
  })

  it('gives a business the Offerings (memberships) + CRM + email + billing spine, never the org-only enroll', () => {
    const ids = spaceSurfacesFor('business', allow).map((s) => s.id)
    expect(ids).toEqual([
      'space.basics',
      'space.mode',
      'space.people',
      'space.layout',
      'space.offerings',
      'space.engage.crm',
      'space.services',
      'space.reach',
      'space.comms',
      'space.insights',
      'space.billing',
      'space.danger',
    ])
    expect(ids).not.toContain('space.engage.memberships')
    expect(ids).not.toContain('space.engage.enroll')
  })

  it('gives an event_space the Offerings (tickets + check-in) + billing spine, never CRM/email', () => {
    const ids = spaceSurfacesFor('event_space', allow).map((s) => s.id)
    expect(ids).toEqual([
      'space.basics',
      'space.mode',
      'space.people',
      'space.layout',
      'space.offerings',
      'space.services',
      'space.reach',
      'space.insights',
      'space.billing',
      'space.danger',
    ])
    expect(ids).not.toContain('space.engage.crm')
    expect(ids).not.toContain('space.engage.tickets')
    expect(ids).not.toContain('space.safety.checkin')
    expect(ids).not.toContain('space.comms')
  })

  it('gives lab + partner the universal four spine plus the always-on Services surface (no Offerings, no role-specific engage)', () => {
    for (const type of ['lab', 'partner'] as const) {
      const ids = spaceSurfacesFor(type, allow).map((s) => s.id)
      expect(ids).toEqual([
        'space.basics',
        'space.mode',
        'space.people',
        'space.layout',
        'space.services',
        'space.reach',
        'space.insights',
        'space.billing',
        'space.danger',
      ])
      // No Offerings (lab/partner have zero commerce functions), no engage / comms surface. Services is
      // FREE profile framing (null-gated), so any type carries it.
      expect(ids).not.toContain('space.offerings')
      expect(ids).not.toContain('space.comms')
      expect(ids.some((id) => id.startsWith('space.engage'))).toBe(false)
    }
  })

  it('falls back to only the always-on Basics + Mode + Layout + Services + Danger when the viewer can use no tool', () => {
    // Mode and focus + Layout + Services are all null-gated (FREE framing, never a per-tool gate), so they
    // render for a manager regardless of which tools are on, alongside Basics + Danger (Space Modes M3 /
    // ADR-472). Services sorts in the engage slot, between Layout and Danger.
    for (const type of ['practitioner', 'organization', 'business', 'coaching', 'event_space', 'lab', 'partner'] as const) {
      expect(spaceSurfacesFor(type, deny).map((s) => s.id)).toEqual([
        'space.basics',
        'space.mode',
        'space.layout',
        'space.services',
        'space.danger',
      ])
    }
  })

  it('orders Basics first and Danger last regardless of which tools are on', () => {
    for (const type of ['practitioner', 'organization', 'business', 'coaching', 'event_space', 'lab', 'partner'] as const) {
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

  it('gives coaching the console spine with CRM (Space Modes M3): basics, mode, people, layout, CRM, reach, insights, billing, danger', () => {
    // Coaching joined the console with Space Modes M3 (ADR-461/464). Its `crm` function lists coaching, so
    // the CRM surface shows; it carries the universal Members / QR / Insights / Billing + the always-on
    // Mode surface. It does NOT get the other types' role-specific engage tools or email (the email
    // function does not list coaching).
    const ids = spaceSurfacesFor('coaching', allow).map((s) => s.id)
    expect(ids).toEqual([
      'space.basics',
      'space.mode',
      'space.people',
      'space.layout',
      'space.engage.crm',
      'space.services',
      'space.reach',
      'space.insights',
      'space.billing',
      'space.danger',
    ])
    // Coaching has zero commerce functions, so no Offerings surface, and no email (email omits coaching).
    expect(ids).not.toContain('space.offerings')
    expect(ids).not.toContain('space.comms')
  })

  it('has unique Space surface ids', () => {
    const ids = SPACE_SURFACES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // THE OFFERINGS VISIBILITY GATE (the deeper Offerings merge): space.offerings is null-gated (it
  // adapts) but must NOT show as an always-on surface — a type with zero commerce functions never
  // opens an empty Offerings card. It shows only when the type has an offering the viewer can use.
  describe('the adaptive Offerings surface visibility gate', () => {
    it('shows Offerings for a type with a usable commerce function (practitioner/business/org/event_space)', () => {
      for (const type of ['practitioner', 'business', 'organization', 'event_space'] as const) {
        expect(spaceSurfacesFor(type, allow).map((s) => s.id)).toContain('space.offerings')
      }
    })

    it('hides Offerings for a type with zero commerce functions (coaching/lab/partner)', () => {
      for (const type of ['coaching', 'lab', 'partner'] as const) {
        expect(spaceSurfacesFor(type, allow).map((s) => s.id)).not.toContain('space.offerings')
      }
    })

    it('hides Offerings when the viewer can use NO commerce function, even on a type that has one', () => {
      // An event_space carries tickets + checkin, but a viewer who can use neither sees no Offerings card
      // (it would open empty). Every non-commerce tool stays usable; only the offering functions are denied.
      const noOfferings = (fn: SpaceFunctionKey): boolean => fn !== 'tickets' && fn !== 'checkin'
      const ids = spaceSurfacesFor('event_space', noOfferings).map((s) => s.id)
      expect(ids).not.toContain('space.offerings')
      expect(ids).toContain('space.people') // a non-commerce surface still shows
    })

    it('shows Offerings when at least ONE of the type\'s offering functions is usable', () => {
      // An event_space where only check-in is usable (tickets denied) still shows Offerings — its
      // Check-in section renders, the Tickets section shows its own locked state inside the page.
      const onlyCheckin = (fn: SpaceFunctionKey): boolean => fn === 'checkin'
      expect(spaceSurfacesFor('event_space', onlyCheckin).map((s) => s.id)).toContain('space.offerings')
    })
  })
})
