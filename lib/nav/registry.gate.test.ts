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

  it('All Spaces — the member catalog in Community, pointing at the directory', () => {
    const area = byKey.get('my-spaces')
    expect(area).toBeDefined()
    expect(area!.label).toBe('All Spaces')
    expect(area!.href).toBe('/spaces/directory')
    expect(area!.section).toBe('Community')
    expect(area!.defaultAccess).toBe('member')
    expect(area!.requiresOperatedSpaces).toBeFalsy()
  })

  it('My Spaces — the operator hub in Admin, data-gated to operators', () => {
    const area = byKey.get('operated-spaces')
    expect(area).toBeDefined()
    expect(area!.label).toBe('My Spaces')
    expect(area!.href).toBe('/spaces/operating')
    expect(area!.section).toBe('Admin')
    expect(area!.requiresOperatedSpaces).toBe(true)
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

  it('the operator "My Spaces" registry node carries the data predicate into its gate', () => {
    const opNode = NAV_REGISTRY.find((n) => n.id === 'operated-spaces')
    expect(opNode?.gate.requiresOperatedSpaces).toBe(true)
    // A member who does not operate a Space never sees it in the palette/spine.
    expect(canSee(opNode!, member)).toBe(false)
    expect(canSee(opNode!, { ...member, operatesSpaces: true })).toBe(true)
  })
})
