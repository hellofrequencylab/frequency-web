import { beforeEach, expect, it, vi } from 'vitest'
const s = vi.hoisted(() => ({ caller: { id: 'viewer' } as { id: string } | null, isAdmin: true, room: { visibility: 'circle', scope_id: 'scope-A' } as { visibility: string; scope_id: string | null } | null, roomError: null as { message: string } | null, updateError: null as { message: string } | null, matched: true, updates: [] as unknown[], filters: [] as [string, string, unknown][], revalidate: vi.fn(), rpc: vi.fn(), from: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: s.revalidate }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => s.caller, getMyProfileId: vi.fn() }))
vi.mock('@/lib/ai/room-search', () => ({ searchRoom: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: s.from, rpc: s.rpc }) }))
import { createRoom, updateRoom } from './actions'
beforeEach(() => {
  vi.clearAllMocks(); s.caller = { id: 'viewer' }; s.isAdmin = true; s.room = { visibility: 'circle', scope_id: 'scope-A' }; s.roomError = null; s.updateError = null; s.matched = true; s.updates = []; s.filters = []
  s.from.mockImplementation((table: string) => {
    let writing = false
    const q = { select: () => q, eq: (key: string, value: unknown) => { s.filters.push(['eq', key, value]); return q }, is: (key: string, value: unknown) => { s.filters.push(['is', key, value]); return q }, update: (patch: unknown) => { writing = true; s.updates.push(patch); return q }, maybeSingle: async () => table === 'room_members' ? { data: { is_admin: s.isAdmin }, error: null } : writing ? { data: s.matched ? { id: 'room-A' } : null, error: s.updateError } : { data: s.room, error: s.roomError } }
    return q
  })
})
function form(visibility = 'public') { const fd = new FormData(); fd.set('name', ' Renamed board '); fd.set('description', ' New description '); fd.set('visibility', visibility); fd.set('scope_id', 'forged-scope'); return fd }
it.each(['circle', 'hub', 'nexus', 'outpost', 'channel', 'unknown'])('keeps stored %s scope visibility on an actual admin rename despite forged manual visibility', async visibility => {
  s.room = { visibility, scope_id: 'scope-A' }
  for (const submitted of ['public', 'private']) {
    expect(await updateRoom('room-A', form(submitted))).toEqual({ data: undefined })
    expect(s.updates.at(-1)).toEqual({ name: 'Renamed board', description: 'New description' })
    expect(s.filters).toContainEqual(['eq', 'profile_id', 'viewer'])
  }
})
it('does not trust a public-looking row with a scope id to change visibility', async () => {
  s.room = { visibility: 'public', scope_id: 'scope-A' }; await updateRoom('room-A', form('private'))
  expect(s.updates[0]).not.toHaveProperty('visibility'); expect(s.updates[0]).not.toHaveProperty('scope_id')
})
it('lets a real manual room admin change manual visibility with a concurrent scope-conversion guard', async () => {
  s.room = { visibility: 'public', scope_id: null }; expect(await updateRoom('room-A', form('private'))).toEqual({ data: undefined })
  expect(s.updates[0]).toEqual({ name: 'Renamed board', description: 'New description', visibility: 'private' })
  expect(s.filters).toContainEqual(['eq', 'visibility', 'public']); expect(s.filters).toContainEqual(['is', 'scope_id', null])
})
it('refuses a non-admin before reading room metadata or writing', async () => {
  s.isAdmin = false; expect(await updateRoom('room-A', form())).toHaveProperty('error')
  expect(s.from).toHaveBeenCalledTimes(1); expect(s.updates).toEqual([]); expect(s.revalidate).not.toHaveBeenCalled()
})
it.each(['read', 'write', 'concurrent-change'])('fails closed for %s without success revalidation or private errors', async failure => {
  if (failure === 'read') s.roomError = { message: 'secret relation' }
  else if (failure === 'write') s.updateError = { message: 'secret relation' }
  else { s.room = { visibility: 'public', scope_id: null }; s.matched = false }
  const result = await updateRoom('room-A', form()); expect(result).toHaveProperty('error'); expect(JSON.stringify(result)).not.toContain('secret relation'); expect(s.revalidate).not.toHaveBeenCalled()
})
it.each(['name', 'description', 'visibility'])('rejects uploaded %s form values without a TypeError or database mutation', async field => {
  const fd = form(); fd.set(field, new Blob(['not text']), 'value.txt')
  expect(await createRoom(fd)).toHaveProperty('error'); expect(s.from).not.toHaveBeenCalled(); expect(s.rpc).not.toHaveBeenCalled()
  expect(await updateRoom('room-A', fd)).toHaveProperty('error'); expect(s.updates).toEqual([])
})
