import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]>, fail: null as string | null, finance: vi.fn(), reads: [] as string[] }))
vi.mock('@/lib/commerce/orders', () => ({ spaceEarningsSummary: (...args: unknown[]) => state.finance(...args) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (table: string) => {
  state.reads.push(table)
  const predicates: ((row: Record<string, unknown>) => boolean)[] = []
  let start = 0, end = Infinity, single = false
  const q = { select: () => q, eq: (key: string, value: unknown) => { predicates.push(row => row[key] === value); return q },
    is: (key: string, value: unknown) => { predicates.push(row => row[key] === value); return q },
    in: (key: string, values: unknown[]) => { predicates.push(row => values.includes(row[key])); return q },
    or: () => q, order: () => q, limit: (n: number) => { end = n - 1; return q },
    range: (a: number, b: number) => { start = a; end = b; return q }, maybeSingle: () => { single = true; return q },
    then: (resolve: (result: { data: unknown; error: unknown }) => unknown) => {
      const rows = (state.tables[table] ?? []).filter(row => predicates.every(predicate => predicate(row))).slice(start, end + 1)
      return Promise.resolve(resolve({ data: single ? rows[0] ?? null : rows, error: state.fail === table ? { message: 'offline' } : null }))
    },
  }; return q
} }) }))
import { readCollectiveNetworkReport } from './network-report'
const parent = { id: 'p', name: 'Parent', slug: 'parent', owner_profile_id: 'owner', parent_id: null, status: 'active', plan: 'collective', type: 'business' }
beforeEach(() => {
  state.fail = null; state.reads = []; state.finance.mockReset().mockResolvedValue({ grossCents: 100, feeCents: 5, netCents: 95, refundedCents: 0, orderCount: 1, networkGrossCents: 0, networkFeeCents: 0, networkOrderCount: 0 })
  state.tables = { spaces: [parent, { ...parent, id: 'c', name: 'Child', slug: 'child', parent_id: 'p', plan: 'free' }, { ...parent, id: 'foreign', parent_id: 'p', owner_profile_id: 'stranger' }],
    space_memberships: [{ id: 'm1', space_id: 'p', member_profile_id: 'real', status: 'active' }, { id: 'm2', space_id: 'c', member_profile_id: 'real', status: 'active' }, { id: 'm3', space_id: 'c', member_profile_id: 'demo', status: 'active' }, { id: 'm4', space_id: 'c', member_profile_id: 'inactive', status: 'active' }],
    profiles: [{ id: 'real', is_active: true, is_demo: false, is_system: false }, { id: 'demo', is_active: true, is_demo: true, is_system: false }, { id: 'inactive', is_active: false, is_demo: false, is_system: false }],
    events: [{ id: 'e1', space_id: 'p', host_space_id: 'c', removed_at: null, is_demo: false }, { id: 'shared', space_id: 'p', host_space_id: 'other', removed_at: null, is_demo: false }] }
})
describe('owner report adapter', () => {
  it('counts only real active profiles and owned/hosted Events, using strict earnings for each authorized Space', async () => {
    expect(await readCollectiveNetworkReport('p', 'owner')).toMatchObject({ status: 'complete', members: 1, events: 1, earnings: { netCents: 190 } })
    expect(state.finance.mock.calls).toEqual([['p', undefined, true], ['c', undefined, true]])
  })
  it('denies a staff/manager who is not the owner before member and financial reads', async () => {
    expect(await readCollectiveNetworkReport('p', 'staff')).toEqual({ status: 'denied' })
    expect(state.reads).toEqual(['spaces']); expect(state.finance).not.toHaveBeenCalled()
  })
  it('declines an over-bound child set without reading any membership or revenue', async () => {
    state.tables.spaces = [parent, ...Array.from({ length: 101 }, (_, index) => ({ ...parent, id: `child-${index}`, parent_id: 'p' }))]
    expect(await readCollectiveNetworkReport('p', 'owner')).toEqual({ status: 'unavailable' })
    expect(state.reads).toEqual(['spaces', 'spaces']); expect(state.finance).not.toHaveBeenCalled()
  })
  it('does not expose a partial report on profile verification error', async () => {
    state.fail = 'profiles'
    expect(await readCollectiveNetworkReport('p', 'owner')).toEqual({ status: 'unavailable' }); expect(state.finance).not.toHaveBeenCalled()
  })
  it('does not expose partial revenue on a financial source error', async () => {
    state.finance.mockRejectedValueOnce(new Error('tickets offline'))
    expect(await readCollectiveNetworkReport('p', 'owner')).toEqual({ status: 'unavailable' })
  })
})
