import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ responses: [] as unknown[], calls: [] as string[] }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({
  from: (table: string) => {
    state.calls.push(table)
    return { select: () => ({ eq: () => ({ maybeSingle: async () => state.responses.shift() }) }) }
  },
}) }))
import { inheritedSpacePlan } from './member-spaces-store'
beforeEach(() => { state.calls = []; state.responses = [] })
describe('live parent entitlement reads', () => {
  it('does not query or replace an independently paid plan', async () => {
    expect(await inheritedSpacePlan('child', 'nonprofit')).toBe('nonprofit')
    expect(state.calls).toEqual([])
  })
  it('checks the actual parent status and plan every time', async () => {
    state.responses = [ { data: { parent_id: 'parent' } }, { data: { plan: 'collective', status: 'active' } } ]
    expect(await inheritedSpacePlan('child', 'free')).toBe('business')
    state.responses = [ { data: { parent_id: 'parent' } }, { data: { plan: 'free', status: 'active' } } ]
    expect(await inheritedSpacePlan('child', 'free')).toBe('free')
  })
  it.each([null, { data: null }, { data: { parent_id: 'parent' }, error: {} }])('never grants paid depth on an unavailable relationship', async result => {
    state.responses = [result]
    expect(await inheritedSpacePlan('child', 'free')).toBe('free')
  })
  it('does not grant when the parent read errors', async () => {
    state.responses = [{ data: { parent_id: 'parent' } }, { data: { plan: 'collective', status: 'active' }, error: {} }]
    expect(await inheritedSpacePlan('child', 'free')).toBe('free')
  })
})
