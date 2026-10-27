import { beforeEach, expect, it, vi } from 'vitest'
const s = vi.hoisted(() => ({ write: vi.fn(), revalidate: vi.fn(), redirect: vi.fn(), member: true, friend: true, admin: true }))
vi.mock('next/cache', () => ({ revalidatePath: s.revalidate }))
vi.mock('next/navigation', () => ({ redirect: s.redirect }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => ({ id: 'caller' }), getMyProfileId: vi.fn() }))
vi.mock('@/lib/ai/room-search', () => ({ searchRoom: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (table: string) => {
  let writing = false
  const q = { select: () => q, eq: () => q, match: () => q, maybeSingle: async () => ({ data: table === 'rooms' ? { id: 'room', visibility: 'public', scope_id: null } : table === 'friendships' ? s.friend ? { id: 'friendship' } : null : s.member ? { is_admin: s.admin } : null, error: null }), upsert: s.write, delete: () => { writing = true; return q }, then: (yes: (value: unknown) => unknown, no: (error: unknown) => unknown) => writing ? s.write().then(yes, no) : Promise.resolve({ data: null, error: null }).then(yes, no) }; return q
} }) }))
import { deleteRoom, inviteToRoom, joinRoom } from './actions'
beforeEach(() => { vi.clearAllMocks(); s.member = s.friend = s.admin = true; s.write.mockResolvedValue({ data: null, error: null }) })
it.each([['join', () => joinRoom('room')], ['invite', () => inviteToRoom('room', 'friend')], ['delete', () => deleteRoom('room')]] as const)('%s refuses returned write errors and transport rejections without false success', async (_name, run) => {
  for (const rejection of [false, true]) {
    vi.clearAllMocks()
    if (rejection) s.write.mockRejectedValue(new Error('private database credential'))
    else s.write.mockResolvedValue({ data: null, error: { message: 'private database credential' } })
    await expect(run()).rejects.toThrow(/Could not .*Please try again/)
    expect(s.revalidate).not.toHaveBeenCalled(); expect(s.redirect).not.toHaveBeenCalled()
  }
})
it.each([['join', () => joinRoom('room')], ['invite', () => inviteToRoom('room', 'friend')], ['delete', () => deleteRoom('room')]] as const)('%s still revalidates confirmed successful writes', async (_name, run) => {
  await run(); expect(s.write).toHaveBeenCalledTimes(1); expect(s.revalidate).toHaveBeenCalled()
})
it('still refuses private invite and delete management without room-admin authority', async () => {
  s.admin = false; await expect(deleteRoom('room')).rejects.toThrow('room admin'); expect(s.write).not.toHaveBeenCalled()
})
it('still refuses invites without accepted friendship before any write', async () => {
  s.friend = false; await expect(inviteToRoom('room', 'friend')).rejects.toThrow('friends'); expect(s.write).not.toHaveBeenCalled()
})
