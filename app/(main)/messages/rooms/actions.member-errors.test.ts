import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ caller: { id: 'me' } as { id: string } | null, admin: true, count: 2 as number | null, countError: null as { message: string } | null, writeError: null as { message: string } | null, writes: [] as { mode: string; payload?: unknown; filters: [string, unknown][] }[], revalidatePath: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: state.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`) } }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => state.caller, getMyProfileId: vi.fn() }))
vi.mock('@/lib/ai/room-search', () => ({ searchRoom: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => {
  let mode = 'read'; let payload: unknown
  const filters: [string, unknown][] = []
  const q = {
    select: (_cols: string, options?: { head?: boolean }) => { if (options?.head) mode = 'count'; return q },
    delete: () => { mode = 'delete'; return q },
    update: (value: unknown) => { mode = 'update'; payload = value; return q },
    eq: (key: string, value: unknown) => { filters.push([key, value]); return q },
    maybeSingle: async () => ({ data: state.admin ? { is_admin: true } : null, error: null }),
    then: (resolve: (result: unknown) => unknown) => {
      if (mode === 'count') return Promise.resolve({ count: state.count, error: state.countError }).then(resolve)
      state.writes.push({ mode, payload, filters })
      return Promise.resolve({ error: state.writeError }).then(resolve)
    },
  }; return q
} }) }))
import { removeFromRoom, promoteRoomMember, demoteRoomMember, leaveRoom } from './actions'
afterEach(() => vi.unstubAllEnvs())
beforeEach(() => { vi.stubEnv('ROOM_ATOMIC_WRITES', ''); state.caller = { id: 'me' }; state.admin = true; state.count = 2; state.countError = null; state.writeError = null; state.writes.length = 0; vi.clearAllMocks() })
it.each([removeFromRoom, promoteRoomMember, demoteRoomMember])('refuses an unauthorized caller before any privileged mutation', async action => {
  state.admin = false
  await expect(action('room-A', 'member-B')).rejects.toThrow('room admin')
  expect(state.writes).toHaveLength(0); expect(state.revalidatePath).not.toHaveBeenCalled()
})
it.each([removeFromRoom, promoteRoomMember, demoteRoomMember])('does not claim success or revalidate after a refused mutation', async action => {
  state.writeError = { message: 'internal policy detail' }
  await expect(action('room-A', 'member-B')).rejects.toThrow('Could not')
  expect(state.writes).toHaveLength(1); expect(state.revalidatePath).not.toHaveBeenCalled()
})
it.each([removeFromRoom, promoteRoomMember, demoteRoomMember])('successful writes remain scoped to the actual room and target member', async action => {
  await action('room-A', 'member-B')
  expect(state.writes[0].filters).toEqual([['room_id', 'room-A'], ['profile_id', 'member-B']])
  expect(state.revalidatePath).toHaveBeenCalledExactlyOnceWith('/messages/r/room-A')
})
it('refuses self-removal, last-admin demotion and unknown/failed admin counts', async () => {
  await expect(removeFromRoom('room-A', 'me')).rejects.toThrow('Use Leave')
  state.count = 1; await expect(demoteRoomMember('room-A', 'member-B')).rejects.toThrow('last admin')
  state.count = null; await expect(demoteRoomMember('room-A', 'member-B')).rejects.toThrow('last admin')
  state.count = 2; state.countError = { message: 'count failed' }
  await expect(demoteRoomMember('room-A', 'member-B')).rejects.toThrow('Could not check room admins')
  expect(state.writes).toHaveLength(0); expect(state.revalidatePath).not.toHaveBeenCalled()
})
it('requires sign-in before all member actions', async () => {
  state.caller = null
  await expect(promoteRoomMember('room-A', 'member-B')).rejects.toThrow('redirect:/sign-in')
  expect(state.writes).toHaveLength(0)
})

it('leave remains self-scoped for ordinary members and propagates refused writes without success', async () => {
  state.admin = false
  await leaveRoom('room-A')
  expect(state.writes[0].filters).toEqual([['room_id', 'room-A'], ['profile_id', 'me']])
  expect(state.revalidatePath).toHaveBeenCalledExactlyOnceWith('/messages')
  state.revalidatePath.mockClear(); state.writeError = { message: 'refused' }
  await expect(leaveRoom('room-A')).rejects.toThrow('Could not leave this room')
  expect(state.revalidatePath).not.toHaveBeenCalled()
})
