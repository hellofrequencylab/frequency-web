import 'server-only'
import { envFlag } from '@/lib/env/string'

interface AtomicResult { data: unknown; error: { code?: string; message: string } | null }
export interface RoomAtomicClient {
  rpc(name: 'room_create_atomic' | 'room_set_member_admin_atomic' | 'room_remove_member_atomic', args: Record<string, unknown>): PromiseLike<AtomicResult>
}
export function roomAtomicWritesEnabled(): boolean { return envFlag('ROOM_ATOMIC_WRITES') }
function assertEnabled() {
  if (!roomAtomicWritesEnabled()) throw new Error('Atomic room writes are not enabled')
}
/** Server caller identity must come from getCallerProfile, never a form field. No legacy-write fallback. */
export async function createRoomAtomic(client: RoomAtomicClient, actorId: string, input: { name: string; description: string | null; visibility: 'public' | 'private' }): Promise<string> {
  assertEnabled()
  const { data, error } = await client.rpc('room_create_atomic', { _actor_id: actorId, _name: input.name, _description: input.description, _visibility: input.visibility })
  if (error) throw new Error(`Could not create room: ${error.message}`)
  if (typeof data !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data)) throw new Error('Room creation returned no valid room ID')
  return data
}
export async function setRoomAdminAtomic(client: RoomAtomicClient, actorId: string, roomId: string, targetId: string, isAdmin: boolean): Promise<void> {
  assertEnabled()
  const { data, error } = await client.rpc('room_set_member_admin_atomic', { _actor_id: actorId, _room_id: roomId, _target_id: targetId, _is_admin: isAdmin })
  if (error) throw new Error(`Could not update room admin: ${error.message}`)
  if (data !== true) throw new Error('Room admin update was not confirmed')
}

export async function removeRoomMemberAtomic(client: RoomAtomicClient, actorId: string, roomId: string, targetId: string): Promise<void> {
  assertEnabled()
  const { data, error } = await client.rpc('room_remove_member_atomic', { _actor_id: actorId, _room_id: roomId, _target_id: targetId })
  if (error) throw new Error(`Could not remove room member: ${error.message}`)
  if (data !== true) throw new Error('Room member removal was not confirmed')
}
