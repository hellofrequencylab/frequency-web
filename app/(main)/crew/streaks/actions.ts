'use server'

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { setStreakPause, clearStreakPause, MAX_PAUSE_DAYS } from '@/lib/practice-streak'

// The "life happens" pause — the member marks a planned rest so a break isn't a
// miss. profileId always comes from the session (never the client), so a member
// can only pause their OWN streak. The rest window is bounded server-side by
// MAX_PAUSE_DAYS in the engine; the client value is clamped, never trusted.

export async function pauseStreak(days: number): Promise<ActionResult<{ days: number }>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')

  const span = Math.max(1, Math.min(MAX_PAUSE_DAYS, Math.floor(Number(days) || 0)))
  try {
    await setStreakPause(profileId, span)
  } catch {
    return fail('Could not start your rest. Try again in a moment.')
  }
  revalidatePath('/crew/streaks')
  return ok({ days: span })
}

export async function resumeStreak(): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')

  try {
    await clearStreakPause(profileId)
  } catch {
    return fail('Could not end your rest. Try again in a moment.')
  }
  revalidatePath('/crew/streaks')
  return ok()
}
