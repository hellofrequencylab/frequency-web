import { describe, it, expect } from 'vitest'
import {
  ADMIN_MODULES,
  modulesFor,
  modulesForSurface,
  modulesForScopeKind,
  showsAdminPanel,
  moduleById,
} from './registry'
import type { Capability, Scope } from '@/lib/core/capabilities'

// The engine is pure: which modules a tier sees is (scope kind × capabilities),
// not a per-role branch. These lock that contract.

const circleScope: Scope = { kind: 'circle', circleId: 'c1', hostId: 'h1' }
const hubScope: Scope = { kind: 'hub', hubId: 'hub1' }
const nexusScope: Scope = { kind: 'nexus', nexusId: 'nx1' }
const eventScope: Scope = { kind: 'event', eventId: 'e1', hostId: 'h1' }
const practiceScope: Scope = { kind: 'practice', practiceId: 'pr1', ownerId: 'o1' }

describe('admin module registry', () => {
  it('surfaces circle.settings to a viewer holding circle.editSettings', () => {
    const caps = new Set<Capability>(['circle.view', 'circle.editSettings'])
    expect(modulesFor(circleScope, caps).map((m) => m.id)).toContain('circle.settings')
    expect(showsAdminPanel(circleScope, caps)).toBe(true)
  })

  it('hides circle modules from a viewer without the capability (member tier)', () => {
    const caps = new Set<Capability>(['circle.view'])
    expect(modulesFor(circleScope, caps)).toHaveLength(0)
    expect(showsAdminPanel(circleScope, caps)).toBe(false)
  })

  it('does not surface circle modules on a non-circle scope', () => {
    const caps = new Set<Capability>(['circle.editSettings'])
    expect(modulesFor({ kind: 'global' }, caps)).toHaveLength(0)
    expect(modulesFor({ kind: 'profile', ownerId: 'p1' }, caps)).toHaveLength(0)
  })

  it('surfaces hub.settings only on a hub scope, only with hub.manage', () => {
    const manage = new Set<Capability>(['hub.manage'])
    expect(modulesFor(hubScope, manage).map((m) => m.id)).toEqual(['hub.settings'])
    expect(modulesFor(hubScope, new Set<Capability>())).toHaveLength(0)
    // hub.manage must not leak the circle module, and circle caps must not leak hub.
    expect(modulesFor(circleScope, manage)).toHaveLength(0)
  })

  it('surfaces nexus.settings only on a nexus scope, only with nexus.manage', () => {
    const manage = new Set<Capability>(['nexus.manage'])
    expect(modulesFor(nexusScope, manage).map((m) => m.id)).toEqual(['nexus.settings'])
    expect(modulesFor(nexusScope, new Set<Capability>())).toHaveLength(0)
    expect(showsAdminPanel(nexusScope, manage)).toBe(true)
  })

  it('surfaces the event spine only on an event scope, only with event.editSettings', () => {
    const caps = new Set<Capability>(['event.editSettings'])
    expect(modulesFor(eventScope, caps).map((m) => m.id)).toEqual([
      'event.settings',
      'event.placeAndTime',
      'event.people',
      'event.engage',
    ])
    expect(modulesFor(eventScope, new Set<Capability>())).toHaveLength(0)
    expect(modulesFor(circleScope, caps)).toHaveLength(0)
  })

  it('surfaces practice.settings only on a practice scope, only with practice.editSettings', () => {
    const caps = new Set<Capability>(['practice.editSettings'])
    expect(modulesFor(practiceScope, caps).map((m) => m.id)).toEqual(['practice.settings'])
    expect(modulesFor(practiceScope, new Set<Capability>())).toHaveLength(0)
    expect(modulesFor(circleScope, caps)).toHaveLength(0)
  })

  it('returns modules ordered by their `order` field', () => {
    const caps = new Set<Capability>(ADMIN_MODULES.map((m) => m.requiredCapability))
    const circleMods = modulesFor(circleScope, caps)
    const orders = circleMods.map((m) => m.order)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
  })

  it('has unique module ids and resolvable lookups', () => {
    const ids = ADMIN_MODULES.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(moduleById('circle.settings')?.requiredCapability).toBe('circle.editSettings')
    expect(moduleById('does.not.exist')).toBeUndefined()
  })

  it('routes modules by surface, and every module declares one', () => {
    const caps = new Set<Capability>(['circle.editSettings'])
    expect(modulesForSurface(circleScope, caps, 'sidebar').map((m) => m.id)).toContain('circle.settings')
    expect(modulesForSurface(circleScope, caps, 'inline')).toHaveLength(0)
    expect(ADMIN_MODULES.every((m) => m.surface === 'inline' || m.surface === 'sidebar')).toBe(true)
  })

  // ADR-250 step 1: registry-driven selection by scope kind (the page admin dock has no
  // resolved caps; it selects by kind and each module self-gates server-side).
  it('selects modules by scope kind, filtered by surface, ordered', () => {
    // Circle now carries the 9-spine editor Apps (ADMIN-RAIL Phase 7): Basics (settings + text),
    // Place & Time, People, Engage. modulesForScopeKind sorts by `order` (stable), so the order-10
    // modules keep declaration order and text (order 15) trails.
    expect(modulesForScopeKind('circle', 'sidebar').map((m) => m.id)).toEqual([
      'circle.settings',
      'circle.placeAndTime',
      'circle.people',
      'circle.engage',
      'circle.text',
    ])
    // Hub/Nexus reach circle/event parity for in-page edit mode (EM1-4): the SettingsDrawer
    // selects their sidebar Basics module by scope kind, exactly as circle/event do.
    expect(modulesForScopeKind('hub', 'sidebar').map((m) => m.id)).toEqual(['hub.settings'])
    expect(modulesForScopeKind('nexus', 'sidebar').map((m) => m.id)).toEqual(['nexus.settings'])
    expect(modulesForScopeKind('event', 'sidebar').map((m) => m.id)).toEqual([
      'event.settings',
      'event.placeAndTime',
      'event.people',
      'event.engage',
    ])
    expect(modulesForScopeKind('practice', 'sidebar').map((m) => m.id)).toEqual(['practice.settings'])
    // person.settings was retired (covered by Edit Profile), so profile has no sidebar module.
    expect(modulesForScopeKind('profile', 'sidebar').map((m) => m.id)).toEqual([])
    // No sidebar leakage across kinds, and inline surface is empty today.
    expect(modulesForScopeKind('circle', 'inline')).toHaveLength(0)
    // Without a surface filter, returns every module valid on the kind.
    expect(modulesForScopeKind('hub').map((m) => m.id)).toEqual(['hub.settings'])
  })
})
