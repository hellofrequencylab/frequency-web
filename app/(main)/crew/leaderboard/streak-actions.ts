'use server'

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { setStreakPause, clearStreakPause, MAX_PAUSE_DAYS } from '@/lib/practice-streak'
import { nudgeCircleMate } from '@/lib/circles/social-fuel'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The "life happens" pause: the member marks a planned rest so a break isn't a
// miss. Streaks (the consistency track) live on the leaderboard since the IA
// consolidation, so these actions revalidate that surface. profileId always comes
// from the session (never the client), so a member can only pause their OWN streak.
// The rest window is bounded server-side by MAX_PAUSE_DAYS; the client value is clamped.

export async function pauseStreak(days: number): Promise<ActionResult<{ days: number }>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')

  const span = Math.max(1, Math.min(MAX_PAUSE_DAYS, Math.floor(Number(days) || 0)))
  try {
    await setStreakPause(profileId, span)
  } catch {
    return fail('Could not start your rest. Try again in a moment.')
  }
  revalidatePath('/crew/leaderboard')
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
  revalidatePath('/crew/leaderboard')
  return ok()
}

/**
 * One-tap "nudge a Circle-mate about to break theirs" (Resonance Engine Phase 5 · ADR-386).
 * Social streaks beat solo ones, and a nudge re-lights both people. profileId always comes
 * from the session (never the client), and nudgeCircleMate additionally binds the poke to a
 * SHARED active Circle, so a member can only nudge someone actually in a room with them.
 */
export async function nudgeStreakMate(mateProfileId: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  const mate = String(mateProfileId || '').trim()
  if (!UUID_RE.test(mate)) return fail('That member id does not look right.')

  const res = await nudgeCircleMate(profileId, mate)
  if (!res.nudged) {
    return fail(
      res.reason === 'not_circle_mates'
        ? 'You can only nudge someone in one of your Circles.'
        : 'Could not send that nudge. Try again in a moment.',
    )
  }
  revalidatePath('/crew/leaderboard')
  return ok()
}
