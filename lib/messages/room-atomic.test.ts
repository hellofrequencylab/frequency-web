import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoomAtomic, roomAtomicWritesEnabled, setRoomAdminAtomic, removeRoomMemberAtomic, type RoomAtomicClient } from './room-atomic'
const room = '00000000-0000-0000-0000-000000000001'
const input = { name: 'Neighbors', description: null, visibility: 'private' as const }
afterEach(() => vi.unstubAllEnvs())
function client(data: unknown = room, error: { message: string; code?: string } | null = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error })
  return { rpc } satisfies RoomAtomicClient
}
describe('opt-in atomic room write adapter', () => {
  it.each(['', 'false', 'off'])('stays off for %s and performs no database call', async flag => {
    vi.stubEnv('ROOM_ATOMIC_WRITES', flag)
    const db = client()
    expect(roomAtomicWritesEnabled()).toBe(false)
    await expect(createRoomAtomic(db, 'actor', input)).rejects.toThrow('not enabled')
    await expect(setRoomAdminAtomic(db, 'actor', room, 'target', false)).rejects.toThrow('not enabled')
    await expect(removeRoomMemberAtomic(db, 'actor', room, 'target')).rejects.toThrow('not enabled')
    expect(db.rpc).not.toHaveBeenCalled()
  })
  it('uses the actual service-only create RPC shape with server-resolved actor identity', async () => {
    vi.stubEnv('ROOM_ATOMIC_WRITES', 'on')
    const db = client()
    expect(await createRoomAtomic(db, 'actor', input)).toBe(room)
    expect(db.rpc).toHaveBeenCalledWith('room_create_atomic', { _actor_id: 'actor', _name: 'Neighbors', _description: null, _visibility: 'private' })
  })
  it('does not fall back to a non-atomic writer if the migration is missing or refused', async () => {
    vi.stubEnv('ROOM_ATOMIC_WRITES', '1')
    const db = client(null, { code: '42883', message: 'function missing' })
    await expect(createRoomAtomic(db, 'actor', input)).rejects.toThrow('Could not create room. Please try again.')
    expect(db.rpc).toHaveBeenCalledTimes(1)
  })
  it('requires a confirmed role update and propagates last-admin refusals', async () => {
    vi.stubEnv('ROOM_ATOMIC_WRITES', 'true')
    const db = client(true)
    await setRoomAdminAtomic(db, 'actor', room, 'target', false)
    expect(db.rpc).toHaveBeenCalledWith('room_set_member_admin_atomic', { _actor_id: 'actor', _room_id: room, _target_id: 'target', _is_admin: false })
    await expect(setRoomAdminAtomic(client(null, { code: '23514', message: 'Cannot remove the last room admin' }), 'actor', room, 'target', false)).rejects.toThrow('last room admin')
    await expect(setRoomAdminAtomic(client(null), 'actor', room, 'target', false)).rejects.toThrow('not confirmed')
  })
  it('uses the manual removal RPC and fails closed on a refusal', async () => {
    vi.stubEnv('ROOM_ATOMIC_WRITES', 'on')
    const db = client(true)
    await removeRoomMemberAtomic(db, 'actor', room, 'target')
    expect(db.rpc).toHaveBeenCalledWith('room_remove_member_atomic', { _actor_id: 'actor', _room_id: room, _target_id: 'target' })
    await expect(removeRoomMemberAtomic(client(null, { code: '23514', message: 'Cannot remove the last room admin' }), 'actor', room, 'target')).rejects.toThrow('last room admin')
  })
  it('rejects malformed create acknowledgements', async () => {
    vi.stubEnv('ROOM_ATOMIC_WRITES', 'on')
    await expect(createRoomAtomic(client('not-a-uuid'), 'actor', input)).rejects.toThrow('valid room ID')
  })
})

it.each(['create', 'role', 'remove'])('does not expose database or transport internals for %s failures', async operation => {
  vi.stubEnv('ROOM_ATOMIC_WRITES', 'on')
  const secret = 'internal_schema.private_table connection credential';
  for (const db of [client(null, { code: '42501', message: secret }), { rpc: vi.fn().mockRejectedValue(new Error(secret)) }]) {
    const write = operation === 'create' ? createRoomAtomic(db, 'actor', input) : operation === 'role' ? setRoomAdminAtomic(db, 'actor', room, 'target', false) : removeRoomMemberAtomic(db, 'actor', room, 'target');
    await expect(write).rejects.toThrow(/Could not .*Please try again/)
    expect(db.rpc).toHaveBeenCalledTimes(1)
  }
})
