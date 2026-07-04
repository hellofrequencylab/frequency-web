import { describe, it, expect } from 'vitest'
import {
  ADMIN_MODULES,
  modulesFor,
  modulesForSurface,
  modulesForScopeKind,
  showsAdminPanel,
  moduleById,
  PERSONAL_MODULE_IDS,
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

  it('surfaces the hub spine only on a hub scope, only with hub.manage', () => {
    const manage = new Set<Capability>(['hub.manage'])
    // Hub now carries the 9-spine editor Apps (ADMIN-RAIL Phase 7): Basics, People, Insights, Danger,
    // all gated hub.manage.
    expect(modulesFor(hubScope, manage).map((m) => m.id)).toEqual([
      'hub.settings',
      'hub.people',
      'hub.insights',
      'hub.danger',
    ])
    expect(modulesFor(hubScope, new Set<Capability>())).toHaveLength(0)
    // hub.manage must not leak the circle module, and circle caps must not leak hub.
    expect(modulesFor(circleScope, manage)).toHaveLength(0)
  })

  it('surfaces the nexus spine only on a nexus scope, only with nexus.manage', () => {
    const manage = new Set<Capability>(['nexus.manage'])
    expect(modulesFor(nexusScope, manage).map((m) => m.id)).toEqual([
      'nexus.settings',
      'nexus.people',
      'nexus.insights',
      'nexus.danger',
    ])
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

  it('surfaces the practice spine only on a practice scope, only with practice.editSettings', () => {
    const caps = new Set<Capability>(['practice.editSettings'])
    // Practice now carries Basics + Insights (ADMIN-RAIL Phase 7), both gated practice.editSettings.
    expect(modulesFor(practiceScope, caps).map((m) => m.id)).toEqual(['practice.settings', 'practice.insights'])
    expect(modulesFor(practiceScope, new Set<Capability>())).toHaveLength(0)
    expect(modulesFor(circleScope, caps)).toHaveLength(0)
  })

  it('returns modules ordered by their `order` field', () => {
    const caps = new Set<Capability>(ADMIN_MODULES.map((m) => m.requiredCapability))
    const circleMods = modulesFor(circleScope, caps)
    const orders = circleMods.map((m) => m.order)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
  })

  // ── Personal "You" apps (ADMIN-RAIL.md Phase 4) ──
  it('registers the personal "You" apps as global-scope, account.manage-gated, account-slot modules', () => {
    const appearance = moduleById('account.appearance')
    expect(appearance).toBeDefined()
    expect(appearance?.scopes).toEqual(['global'])
    expect(appearance?.requiredCapability).toBe('account.manage')
    expect(appearance?.slot).toBe('account')
    expect(appearance?.surface).toBe('sidebar')
  })

  it('PERSONAL_MODULE_IDS is exactly the global-scope (personal) modules', () => {
    const globalIds = ADMIN_MODULES.filter((m) => m.scopes.includes('global')).map((m) => m.id)
    expect([...PERSONAL_MODULE_IDS].sort()).toEqual([...globalIds].sort())
    expect(PERSONAL_MODULE_IDS.has('account.appearance')).toBe(true)
    // A management module is never personal.
    expect(PERSONAL_MODULE_IDS.has('circle.settings')).toBe(false)
  })

  it('selects the personal apps by the global scope kind, and only with account.manage', () => {
    // The bar resolves the "You" set on the global scope; a capable viewer sees it, others do not.
    expect(modulesForScopeKind('global', 'sidebar').map((m) => m.id)).toEqual(['account.appearance'])
    expect(modulesFor({ kind: 'global' }, new Set<Capability>(['account.manage'])).map((m) => m.id)).toEqual([
      'account.appearance',
    ])
    expect(modulesFor({ kind: 'global' }, new Set<Capability>())).toHaveLength(0)
    // Personal apps must not leak onto an entity scope.
    expect(modulesFor(circleScope, new Set<Capability>(['account.manage']))).toHaveLength(0)
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

  // Inline-first rail (ADR-514): every core/personal module renders INLINE in the standardized bar
  // (behavior-preserving — they already render inline); only Space feature workflows link out, and those
  // live in the SPACE_SURFACES lane, not here.
  it('classifies every AdminModule render: "inline" (behavior-preserving)', () => {
    expect(ADMIN_MODULES.every((m) => m.render === 'inline')).toBe(true)
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
    // Hub/Nexus carry their 9-spine editor Apps (ADMIN-RAIL Phase 7): Basics, People, Insights, Danger,
    // in spine order (all order 10, so declaration order holds).
    expect(modulesForScopeKind('hub', 'sidebar').map((m) => m.id)).toEqual([
      'hub.settings',
      'hub.people',
      'hub.insights',
      'hub.danger',
    ])
    expect(modulesForScopeKind('nexus', 'sidebar').map((m) => m.id)).toEqual([
      'nexus.settings',
      'nexus.people',
      'nexus.insights',
      'nexus.danger',
    ])
    expect(modulesForScopeKind('event', 'sidebar').map((m) => m.id)).toEqual([
      'event.settings',
      'event.placeAndTime',
      'event.people',
      'event.engage',
    ])
    expect(modulesForScopeKind('practice', 'sidebar').map((m) => m.id)).toEqual([
      'practice.settings',
      'practice.insights',
    ])
    // person.settings was retired (covered by Edit Profile), so profile has no sidebar module.
    expect(modulesForScopeKind('profile', 'sidebar').map((m) => m.id)).toEqual([])
    // No sidebar leakage across kinds, and inline surface is empty today.
    expect(modulesForScopeKind('circle', 'inline')).toHaveLength(0)
    // Without a surface filter, returns every module valid on the kind.
    expect(modulesForScopeKind('hub').map((m) => m.id)).toEqual([
      'hub.settings',
      'hub.people',
      'hub.insights',
      'hub.danger',
    ])
  })
})
