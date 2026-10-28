'use server'

import { unstable_rethrow } from 'next/navigation'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { LastRoomAdminError } from '@/lib/messages/room-atomic'
import { leaveRoom } from './actions'

/** Convert only known application refusals to public feedback; authentication redirects still escape. */
export async function leaveRoomWithFeedback(roomId: string): Promise<ActionResult<void>> {
  try {
    await leaveRoom(roomId)
    return ok()
  } catch (error) {
    unstable_rethrow(error)
    if (error instanceof LastRoomAdminError) return fail('Make someone else an admin before you leave this room.')
    return fail('Could not leave this room. Please try again.')
  }
}
