import { describe, it, expect } from 'vitest'
import { ADMIN_NAV_APP_LIST, APPS, appById } from './catalog'
import { appGatePasses, isSpineApp, surfacesFor } from './access'
import { STUDIO_LEAVES } from '@/lib/nav/studio'
import { staffCan, type StaffRole } from '@/lib/core/staff-roles'
import { isJanitor, isStaff, atLeastRole, type CommunityRole, type WebRole } from '@/lib/core/roles'
import type { AppViewer } from './types'

// The operator nav lane (ADR-848): every platform admin destination as an App, so the operator rail
// resolves from the same catalog the Space rail and the entity consoles already do.
//
// The load-bearing test here is PARITY. These pages enforce with `requireAdmin`, whose `meetsMin`
// reads 'admin'/'janitor' as the `web_role` staff axis and then UNIONS an optional staff-domain
// capability. If the lane's gate ever drifts from that, the rail starts offering rows that redirect
// to /feed, or hiding rows the viewer can actually open. So the gate is checked against a
// re-implementation of the guard across a viewer matrix, for all 74 leaves.

/** lib/admin/guard.ts::meetsMin — the axis overload the server enforces. */
function guardMeetsMin(min: CommunityRole, role: CommunityRole, webRole: WebRole): boolean {
  if (min === 'janitor') return isJanitor(webRole)
  if (min === 'admin') return isStaff(webRole)
  return atLeastRole(role, min)
}

/** requireAdmin's opt-in union: the primary axis OR the named staff capability. */
function guardAdmits(
  leaf: (typeof STUDIO_LEAVES)[number],
  role: CommunityRole,
  webRole: WebRole,
  staffRole: StaffRole | null,
): boolean {
  const primary = guardMeetsMin(leaf.min, role, webRole)
  if (!leaf.staffDomain) return primary
  return primary || staffCan(staffRole, leaf.staffDomain, leaf.staffLevel ?? 'read')
}

const VIEWERS: { name: string; role: CommunityRole; webRole: WebRole; staffRole: StaffRole | null }[] = [
  { name: 'a plain member', role: 'member', webRole: 'none', staffRole: null },
  { name: 'a host', role: 'host', webRole: 'none', staffRole: null },
  { name: 'a mentor', role: 'mentor', webRole: 'none', staffRole: null },
  { name: 'a real operator (web janitor, community member)', role: 'member', webRole: 'janitor', staffRole: null },
  { name: 'platform staff (web admin)', role: 'member', webRole: 'admin', staffRole: null },
  { name: 'a marketer with no community standing', role: 'member', webRole: 'none', staffRole: 'marketer' },
  { name: 'an analyst', role: 'member', webRole: 'none', staffRole: 'analyst' },
  { name: 'an owner', role: 'member', webRole: 'none', staffRole: 'owner' },
  { name: 'someone holding the deprecated community janitor rung', role: 'janitor', webRole: 'none', staffRole: null },
]

const appViewer = (v: (typeof VIEWERS)[number]): AppViewer => ({
  caps: new Set(),
  role: v.role,
  webRole: v.webRole,
  staffRole: v.staffRole,
})

describe('the lane composes every studio leaf, once', () => {
  it('has one App per leaf', () => {
    expect(ADMIN_NAV_APP_LIST).toHaveLength(STUDIO_LEAVES.length)
  })

  it('namespaces every id so it can never collide with a module id', () => {
    for (const app of ADMIN_NAV_APP_LIST) expect(app.id.startsWith('nav:')).toBe(true)
    // And the whole catalog still has unique ids now that four lanes share one map.
    const ids = APPS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('is reachable through the same appById the other lanes use', () => {
    for (const leaf of STUDIO_LEAVES) {
      const app = appById(`nav:${leaf.id}`)
      expect(app?.label).toBe(leaf.label)
    }
  })

  it('presents the rail surface and never the editor surface', () => {
    for (const app of ADMIN_NAV_APP_LIST) {
      expect(app.surfaces.rail).toBeDefined()
      expect(app.surfaces.editor).toBeUndefined()
    }
  })

  it('carries the nav category, so every spine reader filters it out', () => {
    for (const app of ADMIN_NAV_APP_LIST) {
      expect(app.category).toBe('nav')
      expect(isSpineApp(app)).toBe(false)
    }
  })
})

describe('gate parity with the server guard, across every leaf and viewer', () => {
  for (const v of VIEWERS) {
    it(`resolves ${v.name} exactly as requireAdmin would`, () => {
      const viewer = appViewer(v)
      const mismatches: string[] = []
      for (const leaf of STUDIO_LEAVES) {
        const app = appById(`nav:${leaf.id}`)!
        const got = appGatePasses(app.gate, viewer)
        const want = guardAdmits(leaf, v.role, v.webRole, v.staffRole)
        if (got !== want) mismatches.push(`${leaf.id}: gate=${got} guard=${want}`)
      }
      expect(mismatches).toEqual([])
    })
  }
})

describe('the lane resolves through the shared resolver', () => {
  const operator = appViewer(VIEWERS[3]) // web janitor, community member

  it('surfaces on the global scope for an operator', () => {
    const got = surfacesFor(APPS, { on: 'scopeKind', kind: 'global' }, operator, 'rail')
    expect(got.length).toBeGreaterThan(0)
    for (const app of got) expect(app.id.startsWith('nav:')).toBe(true)
  })

  it('gives a plain member nothing on that scope', () => {
    const member = appViewer(VIEWERS[0])
    const got = surfacesFor(APPS, { on: 'scopeKind', kind: 'global' }, member, 'rail')
    expect(got).toEqual([])
  })

  it('never leaks into an entity scope', () => {
    for (const kind of ['circle', 'event', 'hub', 'nexus', 'journey', 'practice'] as const) {
      const got = surfacesFor(APPS, { on: 'scopeKind', kind }, operator, 'rail')
      expect(got).toEqual([])
    }
  })

  it('never leaks into the editor set, which is what the rail body renders', () => {
    const got = surfacesFor(APPS, { on: 'scopeKind', kind: 'global' }, operator, 'editor')
    expect(got.some((a) => a.id.startsWith('nav:'))).toBe(false)
  })
})
