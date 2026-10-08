import { describe, it, expect, vi } from 'vitest'
import { attachedReportSpaces, buildNetworkReport, type ReportSpace, type ReportDeps } from './network-report-policy'
const parent: ReportSpace = { id: 'p', name: 'Parent', slug: 'parent', parent_id: null, owner_profile_id: 'owner', status: 'active', plan: 'collective', type: 'business' }
const child: ReportSpace = { ...parent, id: 'c', slug: 'child', name: 'Child', parent_id: 'p', plan: 'free' }
const money = { grossCents: 100, feeCents: 5, netCents: 95, refundedCents: 10, orderCount: 1, networkGrossCents: 0, networkFeeCents: 0, networkOrderCount: 0 }
function setup() {
  const rows = new Map([['p', parent], ['c', child]])
  const deps: ReportDeps = { space: vi.fn(async id => rows.get(id) ?? null), children: vi.fn(async () => [child, child, { ...child, id: 'stranger', owner_profile_id: 'other' }]),
    members: vi.fn(async () => [{ member_profile_id: 'one', status: 'active' }, { member_profile_id: 'one', status: 'active' }, { member_profile_id: 'two', status: 'active' }, { member_profile_id: 'three', status: 'cancelled' }]),
    events: vi.fn(async () => [{ id: 'e1', space_id: 'p', host_space_id: 'c' }, { id: 'e1', space_id: 'p', host_space_id: 'c' }, { id: 'listing', space_id: 'p', host_space_id: 'other' }]), earnings: vi.fn(async () => money) }
  return { deps, rows }
}
describe('private Collective reporting', () => {
  it('includes parent, deduplicates actual memberships/events and sums only same-owner attachments', async () => {
    const { deps } = setup(); const report = await buildNetworkReport('p', 'owner', deps)
    expect(report).toMatchObject({ status: 'complete', members: 2, events: 1, earnings: { netCents: 190 } })
    expect(deps.earnings).toHaveBeenCalledTimes(2)
    expect(attachedReportSpaces(parent, [child, child])).toHaveLength(2)
  })
  it.each([null, 'stranger'])('denies non-owner %s before any child or finance reads', async caller => {
    const { deps } = setup(); expect(await buildNetworkReport('p', caller, deps)).toEqual({ status: 'denied' })
    expect(deps.children).not.toHaveBeenCalled(); expect(deps.earnings).not.toHaveBeenCalled()
  })
  it('denies a downgraded parent before member or finance reads', async () => {
    const { deps, rows } = setup(); rows.set('p', { ...parent, plan: 'business' })
    expect(await buildNetworkReport('p', 'owner', deps)).toEqual({ status: 'denied' }); expect(deps.members).not.toHaveBeenCalled(); expect(deps.earnings).not.toHaveBeenCalled()
  })
  it('excludes a transferred child before membership and finance reads', async () => {
    const { deps, rows } = setup(); rows.set('c', { ...child, owner_profile_id: 'stranger' })
    expect(await buildNetworkReport('p', 'owner', deps)).toMatchObject({ status: 'complete', spaces: [{ id: 'p' }] })
    expect(deps.members).toHaveBeenCalledWith(['p']); expect(deps.earnings).toHaveBeenCalledTimes(1)
  })
  it('never returns partial revenue when any earnings source fails', async () => {
    const { deps } = setup(); deps.earnings = vi.fn(async id => { if (id === 'c') throw new Error('tickets offline'); return money })
    expect(await buildNetworkReport('p', 'owner', deps)).toEqual({ status: 'unavailable' })
  })
  it('denies a parent downgrade during report construction before finance', async () => {
    const { deps, rows } = setup(); deps.events = async () => { rows.set('p', { ...parent, plan: 'free' }); return [] }
    expect(await buildNetworkReport('p', 'owner', deps)).toEqual({ status: 'denied' }); expect(deps.earnings).not.toHaveBeenCalled()
  })
})
