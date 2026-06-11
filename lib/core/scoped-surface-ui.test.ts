// Scoped-surface adoption (P1.6, ADR-225) — the presentation helper that turns the
// scoped `surfaceAccess('insight', scope)` AccessLevel into the page affordance the
// circle/hub/nexus detail pages render. These pin the additive contract end-to-end:
// compose the SAME elevation the server seam applies (most-open of the global standing
// and the led-scope level) against the pure matrix, then assert the affordance a global-
// member edge-leader gets IN scope, and that a non-leader (or out-of-scope) gets nothing.

import { describe, it, expect } from 'vitest'
import { accessTo, type Hats } from '@/lib/core/access-matrix'
import { roleToLevel } from '@/lib/core/stewardship'
import { roleRank, type CommunityRole } from '@/lib/core/roles'
import { insightAffordance, showsScopedInsight } from '@/lib/core/scoped-surface-ui'

// Mirror of the server seam's scope→level projection + most-open elevation.
const SCOPE_LEVEL: Record<'circle' | 'hub' | 'nexus', CommunityRole> = {
  circle: roleToLevel('host'),
  hub: roleToLevel('guide'),
  nexus: roleToLevel('mentor'),
}
function hatsLeadingScope(base: Hats, scope: 'circle' | 'hub' | 'nexus'): Hats {
  const scopeRole = SCOPE_LEVEL[scope]
  const role = roleRank(scopeRole) >= roleRank(base.role) ? scopeRole : base.role
  return { ...base, role }
}

const globalMember: Hats = { loggedIn: true, role: 'member', tier: 'free' }

describe('insightAffordance — depth follows the scoped matrix level', () => {
  it('none ⇒ hidden', () => {
    expect(insightAffordance('none')).toEqual({ visible: false })
    expect(showsScopedInsight('none')).toBe(false)
  })
  it('limited ⇒ the basic in-scope view', () => {
    expect(insightAffordance('limited')).toEqual({ visible: true, depth: 'basic', label: 'Circle health' })
    expect(showsScopedInsight('limited')).toBe(true)
  })
  it('full ⇒ the deeper Insight analytics', () => {
    expect(insightAffordance('full')).toEqual({ visible: true, depth: 'full', label: 'Insight' })
    expect(showsScopedInsight('full')).toBe(true)
  })
})

describe('end-to-end — a global-member edge-leader gets the scoped Insight affordance', () => {
  it('non-leader (out of scope) ⇒ no affordance, unchanged from today', () => {
    // The seam returns the global hats when the viewer leads no scope: a plain member.
    expect(accessTo('insight', globalMember)).toBe('none')
    expect(insightAffordance(accessTo('insight', globalMember))).toEqual({ visible: false })
  })

  it('leading a CIRCLE (host) ⇒ the basic affordance', () => {
    const level = accessTo('insight', hatsLeadingScope(globalMember, 'circle'))
    expect(level).toBe('limited')
    expect(insightAffordance(level)).toEqual({ visible: true, depth: 'basic', label: 'Circle health' })
  })

  it('leading a HUB (guide) ⇒ the full Insight affordance', () => {
    const level = accessTo('insight', hatsLeadingScope(globalMember, 'hub'))
    expect(level).toBe('full')
    expect(insightAffordance(level)).toEqual({ visible: true, depth: 'full', label: 'Insight' })
  })

  it('leading a NEXUS (mentor) ⇒ the full Insight affordance', () => {
    const level = accessTo('insight', hatsLeadingScope(globalMember, 'nexus'))
    expect(level).toBe('full')
    expect(insightAffordance(level).visible).toBe(true)
  })

  it('a non-leader stays hidden — the seam never elevates without an edge (isolation)', () => {
    // No edge ⇒ the seam returns the plain global hats ⇒ the affordance reads `none`.
    expect(insightAffordance(accessTo('insight', globalMember))).toEqual({ visible: false })
  })
})
