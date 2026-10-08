import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ responses: [] as unknown[], calls: [] as string[] }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({
  from: (table: string) => {
    state.calls.push(table)
    return { select: () => ({ eq: () => ({ maybeSingle: async () => state.responses.shift() }) }) }
  },
}) }))
import { inheritedSpacePlan } from './member-spaces-store'
const child = { parent_id: 'parent', owner_profile_id: 'owner', status: 'active', type: 'business' }
const parent = { plan: 'collective', status: 'active', owner_profile_id: 'owner', type: 'business', parent_id: null }
beforeEach(() => { state.calls = []; state.responses = [] })
describe('live parent entitlement reads', () => {
  it('does not query or replace an independently paid plan', async () => {
    expect(await inheritedSpacePlan('child', 'nonprofit')).toBe('nonprofit')
    expect(state.calls).toEqual([])
  })
  it('checks the actual parent status and plan every time', async () => {
    state.responses = [ { data: child }, { data: parent } ]
    expect(await inheritedSpacePlan('child', 'free')).toBe('business')
    state.responses = [ { data: child }, { data: { ...parent, plan: 'free' } } ]
    expect(await inheritedSpacePlan('child', 'free')).toBe('free')
  })
  it.each([null, { data: null }, { data: { parent_id: 'parent' }, error: {} }])('never grants paid depth on an unavailable relationship', async result => {
    state.responses = [result]
    expect(await inheritedSpacePlan('child', 'free')).toBe('free')
  })
  it('does not grant when the parent read errors', async () => {
    state.responses = [{ data: child }, { data: parent, error: {} }]
    expect(await inheritedSpacePlan('child', 'free')).toBe('free')
  })
  it.each([
    { ...parent, owner_profile_id: 'new-owner' },
    { ...parent, owner_profile_id: null },
    { ...parent, type: 'root' },
    { ...parent, parent_id: 'another-parent' },
    { ...parent, status: 'suspended' },
  ])('revokes inheritance when the current parent leaves the authorized relationship', async current => {
    state.responses = [{ data: child }, { data: current }]
    expect(await inheritedSpacePlan('child', 'free')).toBe('free')
  })
  it.each([
    { ...child, owner_profile_id: null },
    { ...child, status: 'suspended' },
    { ...child, type: 'root' },
    { ...child, parent_id: null },
  ])('does not grant inheritance to an ineligible child', async current => {
    state.responses = [{ data: current }, { data: parent }]
    expect(await inheritedSpacePlan('child', 'free')).toBe('free')
  })
  it('revokes a child transfer without changing the independently paid plan', async () => {
    state.responses = [{ data: { ...child, owner_profile_id: 'new-owner' } }, { data: parent }]
    expect(await inheritedSpacePlan('child', 'free')).toBe('free')
    expect(await inheritedSpacePlan('child', 'business')).toBe('business')
  })
})
