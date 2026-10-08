import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ caller: { id: 'owner' } as { id: string } | null, owner: 'owner', enabled: true,
  rpc: vi.fn(), revalidate: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => state.caller }))
vi.mock('@/lib/spaces/store', () => ({ getSpaceById: async () => ({ ownerProfileId: state.owner }) }))
vi.mock('@/lib/spaces/functions', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/spaces/functions')>()
  return { ...actual, spaceFunctionAccess: (space: Parameters<typeof actual.spaceFunctionAccess>[0], fn: string, role: Parameters<typeof actual.spaceFunctionAccess>[2]) => state.enabled && actual.spaceFunctionAccess(space, fn, role) }
})
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: state.rpc }) }))
vi.mock('next/cache', () => ({ revalidatePath: state.revalidate }))
import { setCollectiveMemberSpace } from './member-spaces-actions'
beforeEach(() => {
  vi.clearAllMocks(); state.caller = { id: 'owner' }; state.owner = 'owner'; state.enabled = true
  state.rpc.mockResolvedValue({ error: null })
})
describe('server-authorized Collective mutations', () => {
  it.each(['anonymous', 'other-owner', 'disabled-billing'])('refuses %s before accessing privileged RPC', async reason => {
    if (reason === 'anonymous') state.caller = null
    if (reason === 'other-owner') state.owner = 'someone-else'
    if (reason === 'disabled-billing') state.enabled = false
    expect(await setCollectiveMemberSpace('parent', 'child', true)).toHaveProperty('error')
    expect(state.rpc).not.toHaveBeenCalled()
  })
  it('passes the authenticated owner to the transaction, and refreshes the Space subtree', async () => {
    expect(await setCollectiveMemberSpace('parent', 'child', true)).toEqual({ data: undefined })
    expect(state.rpc).toHaveBeenCalledWith('set_collective_member_space', {
      p_parent_id: 'parent', p_child_id: 'child', p_owner_id: 'owner', p_attach: true,
    })
    expect(state.revalidate).toHaveBeenCalledWith('/spaces', 'layout')
  })
  it('reports capacity without claiming success or refreshing', async () => {
    state.rpc.mockResolvedValue({ error: { message: 'collective_full' } })
    expect(await setCollectiveMemberSpace('parent', 'child', true)).toEqual({ error: expect.stringContaining('full') })
    expect(state.revalidate).not.toHaveBeenCalled()
  })
  it('keeps detach on the same authorized mutation seam', async () => {
    await setCollectiveMemberSpace('parent', 'child', false)
    expect(state.rpc.mock.calls[0][1].p_attach).toBe(false)
  })
})
