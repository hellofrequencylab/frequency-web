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
    // Hub carries the 9-spine editor Apps (ADMIN-RAIL Phase 7): Basics, People, Insights, Danger, plus the
    // ADR-515 Phase 5 Layout affordance (between People and Insights), all gated hub.manage.
    expect(modulesFor(hubScope, manage).map((m) => m.id)).toEqual([
      'hub.settings',
      'hub.people',
      'hub.layout',
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
      'nexus.layout',
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

  it('surfaces the journey rail only on a journey scope, only with journey.editSettings (ADR-515 Phase 6)', () => {
    const journeyScope: Scope = { kind: 'journey', journeyId: 'j1', authorId: 'a1' }
    const caps = new Set<Capability>(['journey.editSettings'])
    // Settings (basics), Builder/Layout (layout), Export (reach), Danger (danger) — in `order`.
    expect(modulesFor(journeyScope, caps).map((m) => m.id)).toEqual([
      'journey.settings',
      'journey.builder',
      'journey.export',
      'journey.danger',
    ])
    expect(modulesFor(journeyScope, new Set<Capability>())).toHaveLength(0)
    // No leakage across kinds.
    expect(modulesFor(circleScope, caps)).toHaveLength(0)
    expect(modulesFor(journeyScope, new Set<Capability>(['circle.editSettings']))).toHaveLength(0)
    // Every journey row renders INLINE in the body (no bank tag) and re-uses the one journey capability.
    const journeyMods = ADMIN_MODULES.filter((m) => m.scopes.includes('journey'))
    expect(journeyMods.every((m) => m.render === 'inline' && m.placement !== 'bank')).toBe(true)
    expect(journeyMods.every((m) => m.requiredCapability === 'journey.editSettings')).toBe(true)
    // Danger is present and sits in the danger slot (never banked).
    expect(moduleById('journey.danger')?.slot).toBe('danger')
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
    // The full personal set (ADR-515 Phase 2 · ADR-525), ordered by `order`: the inline body (Profile,
    // Spotlight, Layout, Spotlight look) then the bank surfaces (Appearance, Notifications, Connections,
    // Account and privacy, Billing).
    const personalIds = [
      'account.profile',
      'account.spotlight',
      'account.layout',
      'account.spotlightAppearance',
      'account.appearance',
      'account.notifications',
      'account.connections',
      'account.privacy',
      'account.billing',
    ]
    expect(modulesForScopeKind('global', 'sidebar').map((m) => m.id)).toEqual(personalIds)
    expect(modulesFor({ kind: 'global' }, new Set<Capability>(['account.manage'])).map((m) => m.id)).toEqual(
      personalIds,
    )
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

  // The personal rail (ADR-515 Phase 2 · ADR-525). The BODY is the inline surfaces — Profile, Spotlight,
  // Layout, Spotlight look (placement inline, render inline); the secondary account surfaces — Appearance,
  // Notifications, Connections and location, Account and privacy, Plan and billing — are `placement: 'bank'`
  // (they leave the sidebar body for the bottom bank). Every core entity module (non-global scope) inline.
  it('keeps the profile-look surfaces inline and banks the secondary account surfaces (ADR-515 · ADR-525)', () => {
    const personal = ADMIN_MODULES.filter((m) => m.scopes.includes('global'))
    const inlineBody = personal.filter((m) => m.placement !== 'bank').map((m) => m.id).sort()
    const bank = personal.filter((m) => m.placement === 'bank').map((m) => m.id).sort()
    expect(inlineBody).toEqual([
      'account.layout',
      'account.profile',
      'account.spotlight',
      'account.spotlightAppearance',
    ])
    expect(bank).toEqual([
      'account.appearance',
      'account.billing',
      'account.connections',
      'account.notifications',
      'account.privacy',
    ])
    // The moved surfaces are no longer in the body: none of appearance/notifications/connections is inline.
    for (const id of ['account.appearance', 'account.notifications', 'account.connections']) {
      expect(personal.find((m) => m.id === id)?.placement).toBe('bank')
    }
    // Every core entity module (non-global scope) renders inline in the body (no bank tag).
    expect(ADMIN_MODULES.filter((m) => !m.scopes.includes('global')).every((m) => m.render === 'inline' && m.placement !== 'bank')).toBe(true)
  })

  // ADR-250 step 1: registry-driven selection by scope kind (the page admin dock has no
  // resolved caps; it selects by kind and each module self-gates server-side).
  it('selects modules by scope kind, filtered by surface, ordered', () => {
    // Circle carries the 9-spine editor Apps (ADMIN-RAIL Phase 7) PLUS the ADR-515 Phase 4 additions:
    // This week's practice (engage, order 12) and Insights (order 14). modulesForScopeKind sorts by
    // `order` (stable), so the order-10 modules keep declaration order, then practice (12), insights (14),
    // and text (15) trail.
    expect(modulesForScopeKind('circle', 'sidebar').map((m) => m.id)).toEqual([
      'circle.settings',
      'circle.placeAndTime',
      'circle.people',
      'circle.engage',
      'circle.practice',
      'circle.insights',
      'circle.text',
    ])
    // Hub/Nexus carry their 9-spine editor Apps (ADMIN-RAIL Phase 7) + the ADR-515 Phase 5 Layout
    // affordance: Basics, People, Layout, Insights, Danger, in spine order (all order 10, so declaration
    // order holds).
    expect(modulesForScopeKind('hub', 'sidebar').map((m) => m.id)).toEqual([
      'hub.settings',
      'hub.people',
      'hub.layout',
      'hub.insights',
      'hub.danger',
    ])
    expect(modulesForScopeKind('nexus', 'sidebar').map((m) => m.id)).toEqual([
      'nexus.settings',
      'nexus.people',
      'nexus.layout',
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
    // Channel carries its Basics settings + the ADR-515 Phase 5 Insights readout, both staff-gated
    // (channel.manage).
    expect(modulesForScopeKind('channel', 'sidebar').map((m) => m.id)).toEqual([
      'channel.settings',
      'channel.insights',
    ])
    // Journey carries its ADR-515 Phase 6 rail: Settings, Builder/Layout, Export, Danger, in `order`.
    expect(modulesForScopeKind('journey', 'sidebar').map((m) => m.id)).toEqual([
      'journey.settings',
      'journey.builder',
      'journey.export',
      'journey.danger',
    ])
    // person.settings was retired (covered by Edit Profile), so profile has no sidebar module.
    expect(modulesForScopeKind('profile', 'sidebar').map((m) => m.id)).toEqual([])
    // No sidebar leakage across kinds, and inline surface is empty today.
    expect(modulesForScopeKind('circle', 'inline')).toHaveLength(0)
    // Without a surface filter, returns every module valid on the kind.
    expect(modulesForScopeKind('hub').map((m) => m.id)).toEqual([
      'hub.settings',
      'hub.people',
      'hub.layout',
      'hub.insights',
      'hub.danger',
    ])
  })
})
