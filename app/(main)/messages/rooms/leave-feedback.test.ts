import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const s = vi.hoisted(() => ({ caller: { id: 'trusted-me' } as { id: string } | null, rpc: vi.fn(), from: vi.fn(), revalidate: vi.fn(), filters: [] as [string, string][], legacyError: null as { message: string } | null, clientFailure: null as Error | null }))
vi.mock('next/cache', () => ({ revalidatePath: s.revalidate }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => s.caller, getMyProfileId: vi.fn() }))
vi.mock('@/lib/ai/room-search', () => ({ searchRoom: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => {
  if (s.clientFailure) throw s.clientFailure
  return { rpc: s.rpc, from: s.from }
} }))
import { leaveRoomWithFeedback } from './leave-feedback'
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('ROOM_ATOMIC_WRITES', 'on'); s.caller = { id: 'trusted-me' }; s.filters = []; s.legacyError = null; s.clientFailure = null
  s.rpc.mockResolvedValue({ data: true, error: null })
  s.from.mockImplementation(() => {
    const q = { delete: () => q, eq: (key: string, value: string) => { s.filters.push([key, value]); return q }, then: (resolve: (r: unknown) => unknown) => Promise.resolve({ error: s.legacyError }).then(resolve) }; return q
  })
})
afterEach(() => vi.unstubAllEnvs())
it('turns the actual last-admin RPC refusal into safe structured feedback without success invalidation', async () => {
  s.rpc.mockResolvedValue({ data: null, error: { code: '23514', message: 'private database constraint detail' } })
  expect(await leaveRoomWithFeedback('room-A')).toEqual({ error: 'Make someone else an admin before you leave this room.' })
  expect(s.rpc).toHaveBeenCalledExactlyOnceWith('room_remove_member_atomic', { _actor_id: 'trusted-me', _room_id: 'room-A', _target_id: 'trusted-me' })
  expect(s.from).not.toHaveBeenCalled(); expect(s.revalidate).not.toHaveBeenCalled()
})
it('returns success only after confirmed atomic leave and preserves inbox invalidation', async () => {
  expect(await leaveRoomWithFeedback('room-A')).toEqual({ data: undefined })
  expect(s.revalidate).toHaveBeenCalledExactlyOnceWith('/messages')
})
it.each([{ data: null, error: { code: '42501', message: 'private policy detail' } }, { data: false, error: null }])('sanitizes refused/malformed RPCs without legacy fallback', async result => {
  s.rpc.mockResolvedValue(result)
  expect(await leaveRoomWithFeedback('room-A')).toEqual({ error: 'Could not leave this room. Please try again.' })
  expect(s.revalidate).not.toHaveBeenCalled(); expect(s.from).not.toHaveBeenCalled()
})
it('handles rejected transport promises with a fixed safe message', async () => {
  s.rpc.mockRejectedValue(new Error('private connection credential'))
  expect(await leaveRoomWithFeedback('room-A')).toEqual({ error: 'Could not leave this room. Please try again.' })
})
it('never classifies by matching a message from an unrelated Error', async () => {
  s.clientFailure = new Error('Cannot remove the last room admin.')
  expect(await leaveRoomWithFeedback('room-A')).toEqual({ error: 'Could not leave this room. Please try again.' })
})
it('lets the real Next authentication redirect escape without a database operation', async () => {
  s.caller = null
  await expect(leaveRoomWithFeedback('room-A')).rejects.toMatchObject({ digest: expect.stringContaining('NEXT_REDIRECT') })
  expect(s.rpc).not.toHaveBeenCalled(); expect(s.from).not.toHaveBeenCalled(); expect(s.revalidate).not.toHaveBeenCalled()
})
it('preserves flag-off self-targeted legacy leave semantics', async () => {
  vi.stubEnv('ROOM_ATOMIC_WRITES', '')
  expect(await leaveRoomWithFeedback('room-A')).toEqual({ data: undefined })
  expect(s.from).toHaveBeenCalledExactlyOnceWith('room_members'); expect(s.filters).toEqual([['room_id', 'room-A'], ['profile_id', 'trusted-me']]); expect(s.rpc).not.toHaveBeenCalled()
})
it('reports flag-off failure without success invalidation or raw error details', async () => {
  vi.stubEnv('ROOM_ATOMIC_WRITES', ''); s.legacyError = { message: 'private database detail' }
  expect(await leaveRoomWithFeedback('room-A')).toEqual({ error: 'Could not leave this room. Please try again.' }); expect(s.revalidate).not.toHaveBeenCalled()
})
