'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { isEventCohost } from '@/lib/events/cohosts'
import { viewerActsAsEventHost } from '@/lib/events/host-gate'
import { setSeatAttended, type SeatRef, type SetSeatAttendedResult } from '@/lib/events/attendance'

// THE HOST'S MARK (PROG-GD4). The one action that writes `attended_at` / `attended_by` on a seat,
// from the roster on the Manage Dashboard. Same posture as ./actions.ts: it runs on the admin
// client, so it re-checks the caller as host, cohost or platform staff BEFORE the write, through
// the same two seams the rest of the dashboard gates on (lib/events/host-gate, ADR-841, and
// lib/events/cohosts). The write itself lives in lib/events/attendance.ts and touches the two
// columns and nothing else: no ledger row, no Zaps, no streak. It is the host saying "I saw them",
// which is a different fact from the member saying "I was here" (checkInEvent), and the roster
// shows both.

/** Host, cohost or staff on this event, else null. Mirrors ./actions.ts authorizeManager, which
 *  stays private there because a `use server` export is a callable endpoint. */
async function authorizeManager(eventId: string): Promise<string | null> {
  const profileId = await getMyProfileId()
  if (!profileId) return null
  if (await viewerActsAsEventHost(eventId, profileId)) return profileId
  if (await isEventCohost(eventId, profileId)) return profileId
  return null
}

/** Mark or clear one seat as attended. Refused (with no write) for anyone but a manager. */
export async function setSeatAttendedFromManage(
  eventId: string,
  slug: string,
  seat: SeatRef,
  attended: boolean,
): Promise<SetSeatAttendedResult> {
  const byProfileId = await authorizeManager(eventId)
  if (!byProfileId) return { ok: false, error: 'forbidden' }

  const result = await setSeatAttended(createAdminClient(), { eventId, seat, attended, byProfileId })
  if (result.ok) {
    revalidatePath(`/events/${slug}/manage`)
    revalidatePath(`/events/${slug}`)
  }
  return result
}
