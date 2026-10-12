import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  spaces: {} as Record<string, Record<string, unknown>>,
  memberships: [] as Record<string, unknown>[],
  tiers: {} as Record<string, { name: string }>,
  failParent: false,
  reads: [] as string[],
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      state.reads.push(table)
      const filters: [string, unknown][] = []
      const chain = {
        select: () => chain,
        eq: (c: string, v: unknown) => {
          filters.push([c, v])
          return chain
        },
        maybeSingle: async () => {
          if (table === 'spaces') {
            const id = filters.find(([c]) => c === 'id')?.[1] as string
            if (state.failParent && id === 'parent') return { data: null, error: { message: 'boom' } }
            return { data: state.spaces[id] ?? null, error: null }
          }
          if (table === 'space_memberships') {
            const row = state.memberships.find((m) => filters.every(([c, v]) => m[c] === v)) ?? null
            return { data: row, error: null }
          }
          if (table === 'space_membership_tiers') {
            const id = filters.find(([c]) => c === 'id')?.[1] as string
            return { data: state.tiers[id] ?? null, error: null }
          }
          throw new Error(`unexpected table ${table}`)
        },
      }
      return chain
    },
  }),
}))

import { holdsSharedMembership, resolveSharedMembership, sharedMembershipScope } from './shared-membership'

const relation = {
  childOwnerId: 'owner', parentOwnerId: 'owner', childStatus: 'active', childType: 'business',
  parentType: 'business', parentParentId: null,
}
const parent = { id: 'parent', plan: 'collective', status: 'active' }

describe('sharedMembershipScope (pure)', () => {
  it('counts a Collective membership in a member Space under the relationship rule', () => {
    expect(sharedMembershipScope({ parentId: 'parent' }, parent, relation)).toBe(true)
    expect(sharedMembershipScope({ parentId: 'parent' }, { ...parent, plan: 'nonprofit_collective' }, relation)).toBe(true)
  })
  it('does not depend on the member Space having a free plan: the relationship is the rule', () => {
    // memberSpacePlan would answer the child's own paid plan; the scope asks about the relationship only.
    expect(sharedMembershipScope({ parentId: 'parent' }, parent, { ...relation, childType: 'nonprofit' })).toBe(true)
  })
  it('refuses when the parent is not the Space this child names', () => {
    expect(sharedMembershipScope({ parentId: 'other' }, parent, relation)).toBe(false)
    expect(sharedMembershipScope({ parentId: null }, parent, relation)).toBe(false)
    expect(sharedMembershipScope({ parentId: 'parent' }, null, relation)).toBe(false)
  })
  it('refuses every break in the member-Space rule', () => {
    expect(sharedMembershipScope({ parentId: 'parent' }, { ...parent, status: 'suspended' }, relation)).toBe(false)
    expect(sharedMembershipScope({ parentId: 'parent' }, { ...parent, plan: 'business' }, relation)).toBe(false)
    for (const broken of [
      { ...relation, parentOwnerId: 'someone-else' },
      { ...relation, childOwnerId: null },
      { ...relation, childStatus: 'suspended' },
      { ...relation, childType: 'root' },
      { ...relation, parentType: 'root' },
      { ...relation, parentParentId: 'grandparent' },
    ]) {
      expect(sharedMembershipScope({ parentId: 'parent' }, parent, broken)).toBe(false)
    }
    expect(sharedMembershipScope({ parentId: 'parent' }, parent)).toBe(false)
  })
})

describe('resolveSharedMembership (store)', () => {
  beforeEach(() => {
    state.reads = []
    state.failParent = false
    state.spaces = {
      child: { id: 'child', slug: 'studio-b', name: 'Studio B', brand_name: null, parent_id: 'parent', owner_profile_id: 'owner', status: 'active', type: 'business', plan: 'free' },
      parent: { id: 'parent', slug: 'the-network', name: 'Network', brand_name: 'The Network', parent_id: null, owner_profile_id: 'owner', status: 'active', type: 'business', plan: 'collective' },
    }
    state.memberships = [
      { id: 'm1', space_id: 'parent', member_profile_id: 'viewer', status: 'active', tier_id: 't1', started_at: '2026-10-01T00:00:00.000Z', payment_status: null },
      { id: 'm2', space_id: 'parent', member_profile_id: 'waiter', status: 'waitlist', tier_id: 't1', started_at: '2026-10-01T00:00:00.000Z' },
    ]
    state.tiers = { t1: { name: 'Gold' } }
  })

  it('returns the parent membership labelled with the Collective it came from', async () => {
    const shared = await resolveSharedMembership('child', 'viewer')
    expect(shared).toEqual({
      id: 'm1', tierId: 't1', tierName: 'Gold', startedAt: '2026-10-01T00:00:00.000Z', paymentStatus: null,
      via: { spaceId: 'parent', spaceSlug: 'the-network', spaceName: 'The Network' },
    })
    expect(await holdsSharedMembership('child', 'viewer')).toEqual({ tier_id: 't1' })
  })

  it('does not carry a waitlist spot, and answers null for a stranger', async () => {
    expect(await resolveSharedMembership('child', 'waiter')).toBeNull()
    expect(await resolveSharedMembership('child', 'nobody')).toBeNull()
    expect(await holdsSharedMembership('child', null)).toBeNull()
  })

  it('ends at read time when the Space is detached or the parent is no longer a live Collective', async () => {
    state.spaces.child = { ...state.spaces.child, parent_id: null }
    expect(await resolveSharedMembership('child', 'viewer')).toBeNull()
    expect(state.reads).toEqual(['spaces'])
    state.spaces.child = { ...state.spaces.child, parent_id: 'parent' }
    state.spaces.parent = { ...state.spaces.parent, plan: 'business' }
    expect(await resolveSharedMembership('child', 'viewer')).toBeNull()
    state.spaces.parent = { ...state.spaces.parent, plan: 'collective', owner_profile_id: 'someone-else' }
    expect(await resolveSharedMembership('child', 'viewer')).toBeNull()
  })

  it('grants nothing on a failed read', async () => {
    state.failParent = true
    expect(await resolveSharedMembership('child', 'viewer')).toBeNull()
  })
})
