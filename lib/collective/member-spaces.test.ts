import { describe, expect, it } from 'vitest'
import { isChapterParentPlan, memberSpaceCapacity, memberSpacePlan } from './member-spaces'

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

describe('Network chapters (SCAN-960)', () => {
  it('holds ten included chapters and ignores extra Collective Space quantity', () => {
    expect(memberSpaceCapacity([], 'network')).toBe(10)
    expect(memberSpaceCapacity([{ item_key: 'collective_space', quantity: 3, status: 'active' }], 'network')).toBe(10)
    expect(memberSpaceCapacity([], 'collective')).toBe(5)
  })
  it('adds live purchased chapters up to 25 and never counts them for a Collective (SCAN-1008)', () => {
    expect(memberSpaceCapacity([{ item_key: 'network_chapter', quantity: 3, status: 'active' }], 'network')).toBe(13)
    expect(memberSpaceCapacity([{ item_key: 'network_chapter', quantity: 3, status: 'canceled' }], 'network')).toBe(10)
    expect(memberSpaceCapacity([{ item_key: 'network_chapter', quantity: 40, status: 'active' }], 'network')).toBe(25)
    expect(memberSpaceCapacity([{ item_key: 'network_chapter', quantity: 3, status: 'active' }], 'collective')).toBe(5)
  })
  it('grants Business to a free same-owner chapter of an active Network', () => {
    expect(memberSpacePlan('free', { plan: 'network', status: 'active' }, relation)).toBe('business')
    expect(memberSpacePlan('free', { plan: 'network', status: 'suspended' }, relation)).toBe('free')
    expect(memberSpacePlan('free', { plan: 'network', status: 'active' }, { ...relation, parentOwnerId: 'other' })).toBe('free')
  })
  it('keeps existing Collectives as chapter parents and refuses every other plan', () => {
    for (const plan of ['network', 'collective', 'nonprofit_collective']) expect(isChapterParentPlan(plan)).toBe(true)
    for (const plan of ['free', 'business', 'nonprofit', 'independent', null, 'unknown']) expect(isChapterParentPlan(plan)).toBe(false)
  })
})
