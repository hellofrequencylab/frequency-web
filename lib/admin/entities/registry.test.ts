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
import type { RailTier } from '@/lib/admin/modules/spine'

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

// UNIVERSAL FUNCTIONS (ADR-517 Phase F): every profile is the same functionally, so every console type
// resolves the IDENTICAL full spine (every function applies to every type; the Offerings surface adapts
// but is available to all). `spaceSurfacesFor(type, canUse)` still gates each surface on the caller's
// `canUse(fn)` predicate, so a denied tool drops out; the difference is that the per-TYPE restriction is
// gone. The freemium TIER (Phase G) is where usage/limits will land, not the surface set.

describe('entity registry · spaceSurfacesFor', () => {
  // A canUse predicate that grants every tool (an owner of a Space during the beta).
  const allow = (): boolean => true
  // A canUse predicate that denies every tool (a low role): only the null-gated surfaces render.
  const deny = (): boolean => false

  // The ONE full spine every console type resolves under universal functions, in registry SPINE_ORDER
  // (basics, place, people, layout, engage, reach, comms, safety, insights, billing, danger), declaration
  // order within a slot. The Space menu regroup (ADR-520) put CRM on the `people` slot (Audience group),
  // Email on `reach` (with QR), and billing on `insights`. Modular menu P1b (ADR-544b): the `engage` slot now
  // carries the SEVEN independent commerce surfaces (Booking … Check in, then Store) instead of the merged
  // Offerings row, and CRM is a single row (autonomy + pipeline folded in, no standalone rows).
  const FULL_SPINE = [
    'space.basics',
    'space.mode',
    'space.branding',
    'space.people',
    'space.engage.crm',
    'space.layout',
    'space.booking',
    'space.memberships',
    'space.donations',
    'space.enroll',
    'space.tickets',
    'space.checkin',
    'space.services',
    'space.reach',
    'space.comms',
    'space.settings',
    'space.insights',
    'space.billing',
    'space.danger',
  ]

  const CONSOLE_TYPES = [
    'practitioner',
    'organization',
    'business',
    'event_space',
    'coaching',
    'lab',
    'partner',
  ] as const

  it('gives EVERY console type the identical full spine (same functionally, ADR-517 Phase F)', () => {
    for (const type of CONSOLE_TYPES) {
      expect(spaceSurfacesFor(type, allow).map((s) => s.id), type).toEqual(FULL_SPINE)
    }
    // The commerce surfaces are independent again (ADR-544b), but the old NAMESPACED ids are not used:
    // the Place & Time surface (space.place) and the old space.engage.* namespacing are gone.
    expect(FULL_SPINE).not.toContain('space.place')
    expect(FULL_SPINE.some((id) => id === 'space.engage.donations')).toBe(false)
    expect(FULL_SPINE).not.toContain('space.offerings') // the merged row is gone
  })

  it('falls back to only the always-on identity + page + services + settings + danger when the viewer can use no tool', () => {
    // The null-gated surfaces render for a manager regardless of which tools are on. Every function-gated
    // surface drops out under deny: People / CRM, the six functioned commerce surfaces (Booking …
    // Check in), QR / email / insights / billing. Store (null-gated) stays.
    for (const type of CONSOLE_TYPES) {
      expect(spaceSurfacesFor(type, deny).map((s) => s.id), type).toEqual([
        'space.basics',
        'space.mode',
        'space.branding',
        'space.layout',
        'space.services',
        'space.settings',
        'space.danger',
      ])
    }
  })

  it('orders Basics first and Danger last regardless of which tools are on', () => {
    for (const type of CONSOLE_TYPES) {
      const ids = spaceSurfacesFor(type, allow).map((s) => s.id)
      expect(ids[0]).toBe('space.basics')
      expect(ids[ids.length - 1]).toBe('space.danger')
    }
  })

  it('passes the surface function to canUse so the caller binds the real per-Space gate', () => {
    // Only enable CRM; the spine should then include the single CRM row but drop email + every commerce
    // surface. Autonomy + pipeline are no longer standalone rows (ADR-544b): they fold into CRM.
    const onlyCrm = (fn: SpaceFunctionKey): boolean => fn === 'crm'
    const ids = spaceSurfacesFor('practitioner', onlyCrm).map((s) => s.id)
    expect(ids).toContain('space.engage.crm')
    expect(ids).not.toContain('space.autonomy') // folded into CRM (no standalone row)
    expect(ids).not.toContain('space.pipeline') // folded into CRM (no standalone row)
    expect(ids).not.toContain('space.comms') // email gate denied
    expect(ids).not.toContain('space.booking') // commerce gate denied
    expect(ids).toContain('space.basics') // always-on
    expect(ids).toContain('space.danger') // always-on
  })

  it('has unique Space surface ids', () => {
    const ids = SPACE_SURFACES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // Modular menu P1b (ADR-544b): CRM is a SINGLE row that absorbs Vera autonomy + the Pipeline. Lock that
  // the standalone autonomy/pipeline rail rows are gone and CRM stays one crm-gated row in the Audience slot.
  it('declares CRM as a single crm-gated row, with no standalone autonomy/pipeline rows (ADR-544b)', () => {
    const ids = new Set(SPACE_SURFACES.map((s) => s.id))
    expect(ids.has('space.autonomy')).toBe(false)
    expect(ids.has('space.pipeline')).toBe(false)
    const crm = SPACE_SURFACES.find((s) => s.id === 'space.engage.crm')
    expect(crm).toBeTruthy()
    expect(crm!.requiredFunction).toBe('crm')
    expect(crm!.slot).toBe('people')
    expect(crm!.tier).toBe('primary')
    expect(SPACE_SURFACES.filter((s) => s.requiredFunction === 'crm')).toHaveLength(1)
  })

  // THE THREE-TIER RAIL AXIS (ADR-514 three-tier reorg): each Space surface carries a `tier` band +
  // within-band `priority` so the standardized rail can group STANDARD (identity) → PRIMARY (importance)
  // → EXTRA (under "More"). These lock the exact assignment the owner directive specified.
  describe('three-tier rail tags', () => {
    // ADR-520 + ADR-544b: the 7-group order via (tier, priority). Standard: Identity(10), Page(20) [Starter
    // chip 30]. Primary: Audience (Members 10, CRM 15), Offerings & money (the seven independent commerce
    // surfaces: Booking 30 … Check in 35, then Store 40), Reach (QR 50, Email 55). Extra: Growth (Insights
    // 20, Plan and usage 30), Danger (99).
    const TIERS: Record<string, { tier: RailTier; priority: number }> = {
      'space.basics': { tier: 'standard', priority: 15 },
      'space.branding': { tier: 'standard', priority: 10 },
      'space.layout': { tier: 'standard', priority: 20 },
      'space.mode': { tier: 'standard', priority: 30 },
      'space.people': { tier: 'primary', priority: 10 },
      'space.engage.crm': { tier: 'primary', priority: 15 },
      'space.booking': { tier: 'primary', priority: 30 },
      'space.memberships': { tier: 'primary', priority: 31 },
      'space.donations': { tier: 'primary', priority: 32 },
      'space.enroll': { tier: 'primary', priority: 33 },
      'space.tickets': { tier: 'primary', priority: 34 },
      'space.checkin': { tier: 'primary', priority: 35 },
      'space.services': { tier: 'primary', priority: 40 },
      'space.reach': { tier: 'primary', priority: 50 },
      'space.comms': { tier: 'primary', priority: 55 },
      'space.settings': { tier: 'primary', priority: 70 },
      'space.insights': { tier: 'extra', priority: 20 },
      'space.billing': { tier: 'extra', priority: 30 },
      'space.danger': { tier: 'extra', priority: 99 },
    }

    it('tags every Space surface with the specified band + priority', () => {
      for (const s of SPACE_SURFACES) {
        expect(TIERS[s.id], `missing tier expectation for ${s.id}`).toBeTruthy()
        expect({ tier: s.tier, priority: s.priority }, s.id).toEqual(TIERS[s.id])
      }
    })

    it('puts Members (Audience) at the head of the primary band, CRM right after (ADR-520)', () => {
      const members = SPACE_SURFACES.find((s) => s.id === 'space.people')!
      const crm = SPACE_SURFACES.find((s) => s.id === 'space.engage.crm')!
      expect(members.tier).toBe('primary')
      expect(members.priority).toBe(10)
      expect(crm.tier).toBe('primary')
      expect(crm.priority).toBe(15)
      expect(members.priority!).toBeLessThan(crm.priority!)
    })

    it('keeps Danger in the extra band (obscured under "More", never expanded at top)', () => {
      expect(SPACE_SURFACES.find((s) => s.id === 'space.danger')!.tier).toBe('extra')
    })
  })

  // THE UNIFORM-RAIL PLACEMENT AXIS (ADR-515 Phase 3, the SPACE rail). The owner directive: a feature
  // that PAINTS on the public Space profile keeps its editor INLINE in the rail body; a back-office
  // DESTINATION becomes a BOTTOM-BANK button (placement: 'bank'). Danger is NEVER banked (a destructive
  // action must not be a quick-link) — it stays inline + de-emphasized. These lock that exact split.
  describe('uniform-rail placement tags', () => {
    // The surfaces that leave the body for the bottom bank (back-office destinations). ADR-520: CRM is now
    // an INLINE usage card (its metered usage must be visible in the rail body), so it is NO LONGER banked;
    // the Reach group (Email · QR) and the Growth group (Insights · Plan and usage) stay banked.
    const BANK = new Set(['space.comms', 'space.reach', 'space.insights', 'space.billing'])
    // The surfaces that stay INLINE in the body (paint on the profile, or carry a visible usage card) —
    // plus Danger, which is inline by rule even though it is a back-office action (never a quick-link).
    const INLINE = new Set([
      'space.basics',
      'space.branding',
      'space.mode',
      'space.layout',
      'space.booking',
      'space.memberships',
      'space.donations',
      'space.enroll',
      'space.tickets',
      'space.checkin',
      'space.services',
      'space.people',
      'space.engage.crm',
      'space.settings',
      'space.danger',
    ])

    it('banks Email, QR codes, Insights, and Plan and usage (the back-office destinations, ADR-520)', () => {
      for (const s of SPACE_SURFACES) {
        if (BANK.has(s.id)) expect(s.placement, s.id).toBe('bank')
      }
      // The full banked set is exactly those four (CRM left the bank for an inline usage card).
      expect(SPACE_SURFACES.filter((s) => s.placement === 'bank').map((s) => s.id).sort()).toEqual(
        [...BANK].sort(),
      )
    })

    it('keeps every profile-painting surface INLINE (default placement), and never banks Danger', () => {
      for (const s of SPACE_SURFACES) {
        if (INLINE.has(s.id)) expect(s.placement ?? 'inline', s.id).toBe('inline')
      }
      // Danger is inline by rule (destructive is never a bottom-bank quick-link).
      expect(SPACE_SURFACES.find((s) => s.id === 'space.danger')!.placement ?? 'inline').toBe('inline')
    })

    it('every Space surface is tagged either inline (default) or bank, and the two sets are disjoint + total', () => {
      for (const s of SPACE_SURFACES) {
        expect(BANK.has(s.id) || INLINE.has(s.id), s.id).toBe(true)
      }
      expect(BANK.size + INLINE.size).toBe(SPACE_SURFACES.length)
    })
  })

  // THE INDEPENDENT COMMERCE SURFACES (modular menu P1b, ADR-544b): the merged `space.offerings` row is
  // gone. The seven Offerings & money surfaces are independent, each gated on its OWN per-Space function
  // (Store is null-gated, always on). So a commerce surface shows exactly when its function is usable, which
  // naturally shapes the set per type and never opens an empty adaptive card.
  describe('the independent commerce surfaces', () => {
    const COMMERCE: Record<string, SpaceFunctionKey> = {
      'space.booking': 'availability',
      'space.memberships': 'memberships',
      'space.donations': 'donations',
      'space.enroll': 'enroll',
      'space.tickets': 'tickets',
      'space.checkin': 'checkin',
    }

    it('no longer declares the merged Offerings row or standalone autonomy/pipeline rows', () => {
      const ids = new Set(SPACE_SURFACES.map((s) => s.id))
      expect(ids.has('space.offerings')).toBe(false)
      expect(ids.has('space.autonomy')).toBe(false)
      expect(ids.has('space.pipeline')).toBe(false)
    })

    it('shows each commerce surface only when its OWN function is usable', () => {
      for (const [id, fn] of Object.entries(COMMERCE)) {
        const only = (f: SpaceFunctionKey): boolean => f === fn
        const ids = spaceSurfacesFor('practitioner', only).map((s) => s.id)
        expect(ids, id).toContain(id)
        // A single-function grant surfaces ONLY that commerce tool, never its siblings.
        for (const other of Object.keys(COMMERCE)) {
          if (other !== id) expect(ids, `${id} should not surface ${other}`).not.toContain(other)
        }
      }
    })

    it('always shows Store (null-gated) and hides every functioned commerce surface under deny', () => {
      const ids = spaceSurfacesFor('event_space', deny).map((s) => s.id)
      expect(ids).toContain('space.services') // Store is always-on
      for (const id of Object.keys(COMMERCE)) expect(ids, id).not.toContain(id)
    })

    it('shows every commerce surface to a viewer who can use every function', () => {
      const ids = spaceSurfacesFor('event_space', allow).map((s) => s.id)
      for (const id of [...Object.keys(COMMERCE), 'space.services']) expect(ids, id).toContain(id)
    })
  })
})
