import { describe, it, expect } from 'vitest'
import { NAV_AREAS } from '@/lib/nav-areas'
import { NAV_REGISTRY, canSee, type NavViewer } from '@/lib/nav/registry'
import type { NavNode } from '@/lib/nav/types'

// The unified nav gate (lib/nav/registry::canSee) and the three Spaces nav items. Locks:
//   1. The `requiresOperatedSpaces` DATA predicate is a hard veto in canSee (palette / mobile spine).
//   2. The three distinct Spaces items exist with the right label / route / section / gate.

const member: NavViewer = { role: 'member', staffRole: null }

function node(over: Partial<NavNode> = {}): NavNode {
  return {
    id: 'operated-spaces',
    label: 'My Spaces',
    href: '/spaces/operating',
    icon: 'operated-spaces',
    mode: 'calm',
    surfaces: ['spine', 'palette'],
    gate: { minAccess: 'member' },
    ...over,
  }
}

describe('canSee — requiresOperatedSpaces data gate', () => {
  it('shows the node to a member who operates a Space', () => {
    expect(canSee(node({ gate: { minAccess: 'member', requiresOperatedSpaces: true } }), { ...member, operatesSpaces: true })).toBe(true)
  })

  it('hides the node from a member who operates none (and when the flag is absent)', () => {
    const gated = node({ gate: { minAccess: 'member', requiresOperatedSpaces: true } })
    expect(canSee(gated, { ...member, operatesSpaces: false })).toBe(false)
    expect(canSee(gated, member)).toBe(false) // no operatesSpaces key → hidden, never a leak
  })

  it('leaves a node without the flag governed by the role floor alone', () => {
    expect(canSee(node(), member)).toBe(true)
    expect(canSee(node({ gate: { minAccess: 'admin' } }), member)).toBe(false)
  })
})

describe('the three Spaces nav items', () => {
  const byKey = new Map(NAV_AREAS.map((a) => [a.key, a]))

  it('Business Spaces — the member directory in Community, pointing at the directory', () => {
    const area = byKey.get('my-spaces')
    expect(area).toBeDefined()
    expect(area!.label).toBe('Business Spaces')
    expect(area!.href).toBe('/spaces/directory')
    expect(area!.section).toBe('Community')
    expect(area!.defaultAccess).toBe('member')
    expect(area!.requiresOperatedSpaces).toBeFalsy()
  })

  it('the operator "My Spaces" rail entry is RETIRED (folded into Leadership /lead)', () => {
    // The Spaces a leader runs now surface in the Leadership hub (lead-spaces module), so there is no
    // top-level "operated-spaces" rail node anymore. /spaces/operating stays reachable off-rail.
    expect(byKey.get('operated-spaces')).toBeUndefined()
  })

  it('Manage Spaces — the platform board, admin/staff gated', () => {
    const area = byKey.get('admin-spaces')
    expect(area).toBeDefined()
    expect(area!.label).toBe('Manage Spaces')
    expect(area!.href).toBe('/admin/spaces')
    expect(area!.section).toBe('Admin')
    expect(area!.defaultAccess).toBe('admin')
    expect(area!.staffDomain).toBe('platform')
  })

  it('no live nav node is data-gated on operated Spaces anymore, but the gate mechanism still works', () => {
    // The retirement removed the only requiresOperatedSpaces node; assert none remains.
    expect(NAV_REGISTRY.every((n) => !n.gate.requiresOperatedSpaces)).toBe(true)
    // The gate PLUMBING is retained for a future opt-in. Base it on a member-visible node (Business
    // Spaces) so the ROLE gate never confounds the DATA gate: opting the synthetic node into
    // requiresOperatedSpaces hides it from a non-operator and shows it to an operator.
    const base = NAV_REGISTRY.find((n) => n.id === 'my-spaces')!
    const synthetic = { ...base, id: 'synthetic-operated', gate: { ...base.gate, requiresOperatedSpaces: true } }
    expect(canSee(base, member)).toBe(true) // control: the un-gated node is visible to a member
    expect(canSee(synthetic, member)).toBe(false) // the data gate hides it from a non-operator
    expect(canSee(synthetic, { ...member, operatesSpaces: true })).toBe(true) // and shows it to an operator
  })
})
