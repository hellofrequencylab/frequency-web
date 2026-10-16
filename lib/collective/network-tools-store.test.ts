import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]>, membership: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), cache: (fn: unknown) => fn }))
vi.mock('@/lib/events/store', () => ({ listSpaceCalendarEvents: vi.fn(async () => []) }))
vi.mock('@/lib/spaces/membership', () => ({ getSpaceMembership: state.membership }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from(table: string) {
  let rows = [...(state.tables[table] ?? [])]
  const query = {
    select: () => query, order: () => query, limit: () => query,
    eq: (k: string, v: unknown) => { rows = rows.filter(r => r[k] === v); return query },
    in: (k: string, vs: unknown[]) => { rows = rows.filter(r => vs.includes(r[k])); return query },
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
  }
  return query
} }) }))
const { networkCentralAdminReach, networkToolsAccess } = await import('./network-tools-store')

const space = (id: string, extra: Record<string, unknown> = {}) => ({ id, slug: id, name: id, plan: 'free', status: 'active', type: 'business', parent_id: 'p', owner_profile_id: 'owner', ...extra })
beforeEach(() => {
  state.tables = {
    spaces: [space('p', { plan: 'network', parent_id: null }), space('a'), space('b'), space('outside', { parent_id: null }),
      space('c', { plan: 'collective', parent_id: null }), space('cchild', { parent_id: 'c' })],
    network_central_admins: [{ parent_space_id: 'p', profile_id: 'central' }, { parent_space_id: 'c', profile_id: 'central' }],
  }
  state.membership.mockReset()
  state.membership.mockResolvedValue({ role: 'admin', status: 'active' })
})

describe('central admin reach (getSpaceCapabilities asks this)', () => {
  it('reaches every chapter of the Network it is named on', async () => {
    expect(await networkCentralAdminReach('a', 'central')).toBe(true)
    expect(await networkCentralAdminReach('b', 'central')).toBe(true)
  })
  it('reaches nothing outside it, nothing under a Collective, and nothing for a chapter leader', async () => {
    expect(await networkCentralAdminReach('outside', 'central')).toBe(false)
    expect(await networkCentralAdminReach('cchild', 'central')).toBe(false)
    expect(await networkCentralAdminReach('b', 'leader-of-a')).toBe(false)
    expect(state.membership).not.toHaveBeenCalledWith('p', 'leader-of-a')
  })
  it('ends when the person is no longer an active admin of the parent', async () => {
    state.membership.mockResolvedValue({ role: 'admin', status: 'suspended' })
    expect(await networkCentralAdminReach('a', 'central')).toBe(false)
  })
})

describe('Chapters area access', () => {
  it('admits the owner and a named central admin, never a leader or a Collective owner', async () => {
    expect(await networkToolsAccess('p', 'owner')).toMatchObject({ isOwner: true })
    expect(await networkToolsAccess('p', 'central')).toMatchObject({ isOwner: false })
    expect(await networkToolsAccess('p', 'leader-of-a')).toBeNull()
    expect(await networkToolsAccess('c', 'owner')).toBeNull()
    expect(await networkToolsAccess('p', null)).toBeNull()
  })
})
