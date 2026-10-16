import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({
  caller: 'hub-owner' as string | null,
  spaces: {} as Record<string, Record<string, unknown>>,
  rows: [] as Record<string, unknown>[],
  written: [] as unknown[],
  conflict: false,
}))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => state.caller ? { id: state.caller } : null }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/spaces/store', () => ({ getSpaceById: async (id: string) => state.spaces[id] ? { id, ownerProfileId: state.spaces[id].owner_profile_id } : null }))
vi.mock('@/lib/spaces/functions', () => ({ spaceFunctionAccess: () => true }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (table: string) => {
  let rows: Record<string, unknown>[] = table === 'spaces' ? Object.values(state.spaces) : state.rows.slice()
  let mode: 'read' | 'update' = 'read'
  const chain = {
    select: () => chain,
    eq: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return chain },
    in: (key: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[key])); return chain },
    order: () => chain, range: () => chain,
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    insert: async (patch: unknown) => { state.written.push(patch); return { error: null } },
    update: (patch: unknown) => { state.written.push(patch); mode = 'update'; return chain },
    then: (resolve: (r: unknown) => void) => resolve(mode === 'update' ? { data: state.conflict ? [] : [{ id: 'r' }], error: null } : { data: rows, error: null }),
  }
  return chain
} }) }))
import { invitePartnerSpace, respondPartnerInvite } from './partners-actions'
const failed = (result: object) => 'error' in result
const space = (id: string, owner: string, extra: Record<string, unknown> = {}) => ({ id, slug: id, name: id, owner_profile_id: owner, plan: 'free', status: 'active', visibility: 'network', parent_id: null, type: 'business', ...extra })
beforeEach(() => Object.assign(state, {
  caller: 'hub-owner', written: [], conflict: false, rows: [],
  spaces: { hub: space('hub', 'hub-owner', { plan: 'collective' }), theirs: space('theirs', 'other'), mine: space('mine', 'hub-owner') },
}))

describe('invitePartnerSpace', () => {
  it('writes a pending invite from the hub owner to a Space owned by someone else', async () => {
    expect(failed(await invitePartnerSpace('hub', '/spaces/theirs'))).toBe(false)
    expect(state.written).toEqual([{ hub_space_id: 'hub', partner_space_id: 'theirs', invited_by: 'hub-owner', status: 'pending' }])
  })
  it('refuses a stranger, your own Space, a full hub and a non-Collective hub without writing', async () => {
    state.caller = 'stranger'; expect(failed(await invitePartnerSpace('hub', 'theirs'))).toBe(true)
    state.caller = 'hub-owner'; expect(failed(await invitePartnerSpace('hub', 'mine'))).toBe(true)
    state.rows = Array.from({ length: 10 }, (_, i) => ({ id: String(i), hub_space_id: 'hub', partner_space_id: `x${i}`, status: 'accepted', invited_by: 'hub-owner', responded_by: 'o' }))
    expect(failed(await invitePartnerSpace('hub', 'theirs'))).toBe(true)
    state.rows = []; state.spaces.hub.plan = 'business'
    expect(failed(await invitePartnerSpace('hub', 'theirs'))).toBe(true)
    expect(state.written).toEqual([])
  })
})

describe('respondPartnerInvite', () => {
  const pending = { id: 'r', hub_space_id: 'hub', partner_space_id: 'theirs', status: 'pending', invited_by: 'hub-owner', responded_by: null }
  it('only the partner owner accepts', async () => {
    state.rows = [pending]
    expect(failed(await respondPartnerInvite('r', 'accepted'))).toBe(true)
    state.caller = 'stranger'; expect(failed(await respondPartnerInvite('r', 'accepted'))).toBe(true)
    expect(state.written).toEqual([])
    state.caller = 'other'; expect(failed(await respondPartnerInvite('r', 'accepted'))).toBe(false)
    expect(state.written).toHaveLength(1)
  })
  it('refuses acceptance once the hub left the Collective plan or changed hands', async () => {
    state.rows = [pending]; state.caller = 'other'
    state.spaces.hub.plan = 'business'; expect(failed(await respondPartnerInvite('r', 'accepted'))).toBe(true)
    state.spaces.hub.plan = 'collective'; state.spaces.hub.owner_profile_id = 'new-owner'
    expect(failed(await respondPartnerInvite('r', 'accepted'))).toBe(true)
    expect(state.written).toEqual([])
  })
  it('either side can end an accepted partnership, and a raced write is refused', async () => {
    state.rows = [{ ...pending, status: 'accepted', responded_by: 'other' }]
    expect(failed(await respondPartnerInvite('r', 'revoked'))).toBe(false)
    state.caller = 'other'; expect(failed(await respondPartnerInvite('r', 'revoked'))).toBe(false)
    state.conflict = true; expect(failed(await respondPartnerInvite('r', 'revoked'))).toBe(true)
  })
})
