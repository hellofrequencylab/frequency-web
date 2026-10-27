import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const s = vi.hoisted(() => ({ caller: { id: 'trusted-actor' } as { id: string } | null, admin: true, rpc: vi.fn(), writes: vi.fn(), revalidate: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: s.revalidate }))
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`) } }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => s.caller, getMyProfileId: vi.fn() }))
vi.mock('@/lib/ai/room-search', () => ({ searchRoom: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: s.rpc, from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: s.admin ? { is_admin: true } : null, error: null }), insert: s.writes, update: s.writes, delete: s.writes }; return q } }) }))
import { createRoom, promoteRoomMember, demoteRoomMember, removeFromRoom, leaveRoom } from './actions'
const ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('ROOM_ATOMIC_WRITES', 'true'); s.caller = { id: 'trusted-actor' }; s.admin = true; s.rpc.mockResolvedValue({ data: true, error: null }) })
afterEach(() => vi.unstubAllEnvs())
function form() { const fd = new FormData(); fd.set('name', 'Our room'); fd.set('visibility', 'channel'); fd.set('actor_id', 'forged-actor'); return fd }
it('enabled creation uses the trusted actor and coerced public/private visibility in one confirmed RPC', async () => {
  s.rpc.mockResolvedValue({ data: ID, error: null })
  expect(await createRoom(form())).toEqual({ data: { id: ID } })
  expect(s.rpc).toHaveBeenCalledExactlyOnceWith('room_create_atomic', { _actor_id: 'trusted-actor', _name: 'Our room', _description: '', _visibility: 'public' })
  expect(s.writes).not.toHaveBeenCalled(); expect(s.revalidate).toHaveBeenCalledExactlyOnceWith('/messages')
})
it.each([{ data: null, error: { message: 'secret database error' } }, { data: true, error: null }])('enabled creation fails closed on rejected or malformed RPC without legacy fallback', async reply => {
  s.rpc.mockResolvedValue(reply)
  const result = await createRoom(form()); expect('error' in result).toBe(true)
  expect(JSON.stringify(result)).not.toContain('secret database error'); expect(s.writes).not.toHaveBeenCalled(); expect(s.revalidate).not.toHaveBeenCalled()
})
it.each([[promoteRoomMember, 'room_set_member_admin_atomic', true], [demoteRoomMember, 'room_set_member_admin_atomic', false], [removeFromRoom, 'room_remove_member_atomic', undefined]] as const)('enabled member action uses the actual atomic seam without legacy writes', async (action, name, admin) => {
  await action('room-A', 'target-B')
  expect(s.rpc).toHaveBeenCalledExactlyOnceWith(name, { _actor_id: 'trusted-actor', _room_id: 'room-A', _target_id: 'target-B', ...(admin === undefined ? {} : { _is_admin: admin }) })
  expect(s.writes).not.toHaveBeenCalled(); expect(s.revalidate).toHaveBeenCalledExactlyOnceWith('/messages/r/room-A')
})
it.each([promoteRoomMember, demoteRoomMember, removeFromRoom])('enabled member action retains admin authorization before RPC', async action => {
  s.admin = false; await expect(action('room-A', 'target-B')).rejects.toThrow('room admin')
  expect(s.rpc).not.toHaveBeenCalled(); expect(s.writes).not.toHaveBeenCalled()
})
it.each([promoteRoomMember, demoteRoomMember, removeFromRoom])('enabled RPC refusal cannot fall through to a legacy write or success revalidation', async action => {
  s.rpc.mockResolvedValue({ data: null, error: { code: '23514', message: 'secret database error' } })
  await expect(action('room-A', 'target-B')).rejects.toThrow('last room admin')
  expect(s.writes).not.toHaveBeenCalled(); expect(s.revalidate).not.toHaveBeenCalled()
})
it('enabled removal retains the explicit self-removal boundary', async () => {
  await expect(removeFromRoom('room-A', 'trusted-actor')).rejects.toThrow('Use Leave')
  expect(s.rpc).not.toHaveBeenCalled()
})

it('transport failures remain safe and cannot trigger a legacy creation fallback', async () => {
  s.rpc.mockRejectedValue(new Error('secret transport detail'))
  const result = await createRoom(form())
  expect(result).toEqual({ error: 'Could not create room. Please try again.' })
  expect(s.writes).not.toHaveBeenCalled(); expect(s.revalidate).not.toHaveBeenCalled()
})
it.each([promoteRoomMember, demoteRoomMember, removeFromRoom])('malformed acknowledgements cannot become a successful member mutation', async action => {
  s.rpc.mockResolvedValue({ data: false, error: null })
  await expect(action('room-A', 'target-B')).rejects.toThrow('not confirmed')
  expect(s.writes).not.toHaveBeenCalled(); expect(s.revalidate).not.toHaveBeenCalled()
})

it('enabled leave uses the trusted self target without requiring admin and cannot bypass last-admin refusal', async () => {
  s.admin = false
  await leaveRoom('room-A')
  expect(s.rpc).toHaveBeenCalledExactlyOnceWith('room_remove_member_atomic', { _actor_id: 'trusted-actor', _room_id: 'room-A', _target_id: 'trusted-actor' })
  expect(s.revalidate).toHaveBeenCalledExactlyOnceWith('/messages')
  s.revalidate.mockClear(); s.rpc.mockResolvedValue({ data: null, error: { code: '23514', message: 'last admin' } })
  await expect(leaveRoom('room-A')).rejects.toThrow('last room admin')
  expect(s.writes).not.toHaveBeenCalled(); expect(s.revalidate).not.toHaveBeenCalled()
})
