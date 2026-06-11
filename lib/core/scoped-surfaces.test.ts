// Scoped surfaces (P1.6 PR 2, ADR-221) — the ADDITIVE elevation the surface matrix
// applies when a viewer LEADS a scope by stewardship edge.
//
// The server seam `surfaceAccess(surface, scope)` (lib/core/viewer-hats.ts) resolves a
// viewer's global hats, and — when the viewer holds an active edge on `scope` — elevates
// the matrix's COMMUNITY standing to that scope's level (circle⇒host, hub⇒guide,
// nexus⇒mentor) for that one call, taking the MOST-OPEN of the global standing and the
// scope level (never a downgrade). These tests pin the deterministic core of that
// elevation against the pure matrix: the in-scope surfaces light for an edge-leader who
// is a global member, do NOT light out of scope, and NO global role regresses.

import { describe, it, expect } from 'vitest'
import { accessTo, type Hats } from '@/lib/core/access-matrix'
import { roleToLevel, communityStanding } from '@/lib/core/stewardship'
import { roleRank, type CommunityRole } from '@/lib/core/roles'

// Mirror of viewer-hats.ts `scopeLevel` + the most-open elevation — the SAME projection
// the server seam applies, exercised here against the pure matrix (no DB).
const SCOPE_LEVEL: Record<'circle' | 'hub' | 'nexus', CommunityRole> = {
  circle: roleToLevel('host'),
  hub: roleToLevel('guide'),
  nexus: roleToLevel('mentor'),
}

/** The hats the seam would resolve for a viewer who leads `scope` by edge. */
function hatsLeadingScope(base: Hats, scopeType: 'circle' | 'hub' | 'nexus'): Hats {
  const scopeRole = SCOPE_LEVEL[scopeType]
  const role = roleRank(scopeRole) >= roleRank(base.role) ? scopeRole : base.role
  return { ...base, role }
}

// A global member by community standing (the case the whole PR is about).
const globalMember: Hats = { loggedIn: true, role: 'member', tier: 'free' }

describe('scoped surface elevation — a global-member edge-leader gains IN-SCOPE surfaces', () => {
  it('leading a HUB (guide level) lights the guide-only Insight/Vera surfaces', () => {
    // Global member: no Insight/Vera.
    expect(accessTo('insight', globalMember)).toBe('none')
    expect(accessTo('veraAi', globalMember)).toBe('none')
    // …but leading a hub elevates them to guide → full deeper analytics.
    const asHubGuide = hatsLeadingScope(globalMember, 'hub')
    expect(accessTo('insight', asHubGuide)).toBe('full')
    expect(accessTo('veraAi', asHubGuide)).toBe('full')
  })

  it('leading a CIRCLE (host level) lights the host-limited Insight view', () => {
    const asCircleHost = hatsLeadingScope(globalMember, 'circle')
    expect(accessTo('insight', asCircleHost)).toBe('limited') // host basic view
    // …and the stewardship-gated paid surfaces (host is full on the sheet).
    expect(accessTo('qrStudio', asCircleHost)).toBe('full')
    expect(accessTo('studioOverview', asCircleHost)).toBe('full')
  })

  it('leading a NEXUS (mentor level) lights the senior-steward surfaces', () => {
    const asNexusMentor = hatsLeadingScope(globalMember, 'nexus')
    expect(accessTo('insight', asNexusMentor)).toBe('full')
    expect(accessTo('veraAi', asNexusMentor)).toBe('full')
  })

  it('does NOT grant admin/janitor surfaces — the elevation tops out at mentor', () => {
    const asNexusMentor = hatsLeadingScope(globalMember, 'nexus')
    expect(accessTo('platformManage', asNexusMentor)).toBe('none')
    expect(accessTo('financialDashboard', asNexusMentor)).toBe('none')
  })
})

describe('scope isolation — no edge ⇒ no elevation (out-of-scope stays today’s global)', () => {
  it('a global member with NO led scope sees the plain global matrix', () => {
    // The seam returns the global hats unchanged when leadsScopeById is false; that is
    // exactly `globalMember` here.
    expect(accessTo('insight', globalMember)).toBe('none')
    expect(accessTo('veraAi', globalMember)).toBe('none')
    expect(accessTo('qrStudio', globalMember)).toBe('limited') // paid-gated preview only
  })
})

describe('ADDITIVE guarantee — global roles never regress under scoping', () => {
  const SURFACES = [
    'insight', 'veraAi', 'qrStudio', 'studioOverview', 'vault', 'platformManage',
    'financialDashboard', 'feed', 'people',
  ] as const

  const globalRoles: Hats[] = [
    { loggedIn: true, role: 'host', tier: 'free' },
    { loggedIn: true, role: 'guide', tier: 'free' },
    { loggedIn: true, role: 'mentor', tier: 'free' },
    { loggedIn: true, role: 'admin' },
    { loggedIn: true, role: 'janitor' },
  ]

  it('elevating to ANY scope level is a superset of the global access for every global role', () => {
    for (const base of globalRoles) {
      for (const scopeType of ['circle', 'hub', 'nexus'] as const) {
        const scoped = hatsLeadingScope(base, scopeType)
        for (const s of SURFACES) {
          const g = accessTo(s, base)
          const sc = accessTo(s, scoped)
          // Scoped access is the most-open of global and scope level — never lower.
          const order = { none: 0, limited: 1, full: 2 }
          expect(order[sc]).toBeGreaterThanOrEqual(order[g])
        }
      }
    }
  })

  it('admin/janitor keep their exclusive surfaces even when leading a (lower) scope', () => {
    const adminLeadingCircle = hatsLeadingScope({ loggedIn: true, role: 'admin' }, 'circle')
    expect(accessTo('platformManage', adminLeadingCircle)).toBe('full')
    const janitorLeadingHub = hatsLeadingScope({ loggedIn: true, role: 'janitor' }, 'hub')
    expect(accessTo('financialDashboard', janitorLeadingHub)).toBe('full')
  })
})

describe('the standing the seam feeds the matrix is the floored community_level', () => {
  it('communityStanding never drops below community_role, then scope elevation only adds', () => {
    // The seam: getViewerHats role = communityStanding(level, community_role); a led scope
    // elevates from there. Compose both and assert monotonicity for a global member.
    const standing = communityStanding('member', 'member') // a plain global member
    const baseHats: Hats = { loggedIn: true, role: standing, tier: 'free' }
    const scopeRole: CommunityRole = SCOPE_LEVEL.hub
    const elevated = roleRank(scopeRole) >= roleRank(baseHats.role) ? scopeRole : baseHats.role
    expect(roleRank(elevated)).toBeGreaterThanOrEqual(roleRank(baseHats.role))
    expect(elevated).toBe('guide')
  })
})
