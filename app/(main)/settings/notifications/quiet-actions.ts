'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getMyProfileId } from '@/lib/auth'
import { type ActionResult, ok, fail, safeErrorMessage } from '@/lib/action-result'

// Quiet hours (EMAIL-091): while they last, a hub push or email waits and goes at the end; the bell
// still rings. Two hours of the day in the member's own time zone; null for both turns it off.
// authz: the caller's own notification_preferences row only, through their session (RLS own-row).

function hour(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : null
}

export async function saveQuietHours(start: unknown, end: unknown): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  const s = hour(start)
  const e = hour(end)
  const off = s === null || e === null || s === e
  const supabase = await createClient()
  const { error } = await supabase
    .from('notification_preferences')
    .upsert({ profile_id: profileId, quiet_hours_start: off ? null : s, quiet_hours_end: off ? null : e }, { onConflict: 'profile_id' })
  if (error) return fail(safeErrorMessage(error))
  revalidatePath('/settings/notifications')
  revalidatePath('/settings')
  return ok()
}
