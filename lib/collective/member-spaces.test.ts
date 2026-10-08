import { describe, expect, it } from 'vitest'
import { memberSpaceCapacity, memberSpacePlan } from './member-spaces'

const relation = { childOwnerId: 'owner', parentOwnerId: 'owner', childStatus: 'active', childType: 'business', parentType: 'business', parentParentId: null }

describe('Collective member Space entitlement', () => {
  it('starts at five, adding only live purchased extra Space quantity', () => {
    expect(memberSpaceCapacity([])).toBe(5)
    expect(memberSpaceCapacity([
      { item_key: 'collective_space', quantity: 3, status: 'active' },
      { item_key: 'collective_space', quantity: 2, status: 'trialing' },
      { item_key: 'collective_space', quantity: 1, status: 'past_due' },
      { item_key: 'collective_space', quantity: 20, status: 'canceled' },
      { item_key: 'collective_space', quantity: 20, status: 'pending' },
      { item_key: 'operator_seat', quantity: 50, status: 'active' },
      { item_key: 'collective_space', quantity: -2, status: 'active' },
      { item_key: 'collective_space', quantity: NaN, status: 'active' },
    ])).toBe(11)
  })
  it('grants Business to a free child of either active Collective plan', () => {
    for (const plan of ['collective', 'nonprofit_collective']) {
      expect(memberSpacePlan('free', { plan, status: 'active' }, relation)).toBe('business')
    }
  })
  it('requires current same-owner eligibility in every reader', () => {
    const parent = { plan: 'collective', status: 'active' }
    expect(memberSpacePlan('free', parent)).toBe('free')
    for (const changed of [{ ...relation, parentOwnerId: 'other' }, { ...relation, childOwnerId: null }, { ...relation, childStatus: 'suspended' }, { ...relation, childType: 'root' }, { ...relation, parentType: 'root' }, { ...relation, parentParentId: 'nested' }]) {
      expect(memberSpacePlan('free', parent, changed)).toBe('free')
    }
  })
  it('restores the own plan immediately after detach, cancellation or suspension', () => {
    for (const parent of [null, { plan: 'free', status: 'active' }, { plan: 'collective', status: 'suspended' }]) {
      expect(memberSpacePlan('free', parent)).toBe('free')
      expect(memberSpacePlan('nonprofit', parent)).toBe('nonprofit')
    }
  })
  it('never replaces an independently purchased plan, nor grants from Hub/Nexus containment', () => {
    for (const own of ['business', 'nonprofit', 'independent', 'collective', 'nonprofit_collective']) {
      expect(memberSpacePlan(own, { plan: 'collective', status: 'active' })).toBe(own)
    }
    expect(memberSpacePlan('free', { plan: 'business', status: 'active' })).toBe('free')
    expect(memberSpacePlan('free', { plan: 'unknown', status: 'active' })).toBe('free')
  })
})
