import 'server-only'
import { envFlag } from '@/lib/env/string'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

export type RoomAtomicClient = Pick<SupabaseClient<Database>, 'rpc'>
export function roomAtomicWritesEnabled(): boolean { return envFlag('ROOM_ATOMIC_WRITES') }
function assertEnabled() {
  if (!roomAtomicWritesEnabled()) throw new Error('Atomic room writes are not enabled')
}
/** Server caller identity must come from getCallerProfile, never a form field. No legacy-write fallback. */
export async function createRoomAtomic(client: RoomAtomicClient, actorId: string, input: { name: string; description: string | null; visibility: 'public' | 'private' }): Promise<string> {
  assertEnabled()
  const { data, error } = await client.rpc('room_create_atomic', { _actor_id: actorId, _name: input.name, _description: input.description ?? '', _visibility: input.visibility }).then(result => result, () => { throw new Error('Could not create room. Please try again.') })
  if (error) throw new Error('Could not create room. Please try again.')
  if (typeof data !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data)) throw new Error('Room creation returned no valid room ID')
  return data
}
export async function setRoomAdminAtomic(client: RoomAtomicClient, actorId: string, roomId: string, targetId: string, isAdmin: boolean): Promise<void> {
  assertEnabled()
  const { data, error } = await client.rpc('room_set_member_admin_atomic', { _actor_id: actorId, _room_id: roomId, _target_id: targetId, _is_admin: isAdmin }).then(result => result, () => { throw new Error('Could not update room admin. Please try again.') })
  if (error) throw new Error(error.code === '23514' ? 'Cannot remove the last room admin.' : 'Could not update room admin. Please try again.')
  if (data !== true) throw new Error('Room admin update was not confirmed')
}

export async function removeRoomMemberAtomic(client: RoomAtomicClient, actorId: string, roomId: string, targetId: string): Promise<void> {
  assertEnabled()
  const { data, error } = await client.rpc('room_remove_member_atomic', { _actor_id: actorId, _room_id: roomId, _target_id: targetId }).then(result => result, () => { throw new Error('Could not remove room member. Please try again.') })
  if (error) throw new Error(error.code === '23514' ? 'Cannot remove the last room admin.' : 'Could not remove room member. Please try again.')
  if (data !== true) throw new Error('Room member removal was not confirmed')
}
