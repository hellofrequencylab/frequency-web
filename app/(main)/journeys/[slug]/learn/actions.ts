'use server'

// Journeys v2 — the lesson player's complete action (ADR-252, J1b). Records a lesson check-off
// (member-owned via journey_lesson_progress) and computes which milestone rewards just
// unlocked (phase/journey complete) so the player can celebrate. The actual Gem/trophy grants
// for those events wire in J3; the events flow is in place now.

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { getPlan, completeLesson, uncompleteLesson } from '@/lib/journey-plans'
import { getJourneyTree } from '@/lib/journeys/store'
import { rewardEventsForTransition, type JourneyRewardEvent } from '@/lib/journeys/rewards'
import { grantJourneyRewards, grantExtraCreditIfAny, type GrantedJourneyReward } from '@/lib/journeys/grants'

export async function completeJourneyLessonAction(
  slug: string,
  itemId: string,
): Promise<ActionResult<{ events: JourneyRewardEvent[]; granted: GrantedJourneyReward[]; bonusZaps: number }>> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Sign in to track your progress.')
  const loaded = await getPlan(slug)
  if (!loaded) return fail('Journey not found.')
  const planId = loaded.plan.id

  const before = await getJourneyTree(slug, caller.id)
  const ticked = await completeLesson(caller.id, planId, itemId)
  if (!ticked.ok) return fail(ticked.error)
  const after = await getJourneyTree(slug, caller.id)

  const events =
    before && after ? rewardEventsForTransition({ profileId: caller.id, planId, before, after }) : []

  // Grant the milestone Gems for any phase/journey just completed (idempotent, best-effort).
  let granted: GrantedJourneyReward[] = []
  if (events.length) {
    try {
      granted = await grantJourneyRewards({
        profileId: caller.id,
        completionGems: loaded.plan.completion_gems ?? 30,
        events,
      })
    } catch {
      /* rewards are best-effort — never block the check-off */
    }
  }

  // Extra-credit Challenge (ADR-300 Part 2): if this block is an above-and-beyond bonus task,
  // pay its bonus Zaps exactly once. Best-effort — never blocks the check-off.
  let bonusZaps = 0
  try {
    bonusZaps = await grantExtraCreditIfAny(caller.id, planId, itemId)
  } catch {
    /* best-effort */
  }

  revalidatePath(`/journeys/${slug}/learn`)
  return ok({ events, granted, bonusZaps })
}

/**
 * Undo a lesson check-off. The complete path above has existed since ADR-252 and this one has
 * not, so a member could tick a lesson and never untick it — a mis-tap was permanent, and the
 * progress bar it moved could not be moved back. `uncompleteLesson` was written at the same time
 * as `completeLesson` and simply never wired to a surface (SCAN-502 group a).
 *
 * 🔴 IT DELIBERATELY DOES NOT CLAW ANYTHING BACK. Completing can grant milestone Gems, a trophy
 * and extra-credit Zaps, and every one of those grants is once-ever and idempotent by design.
 * Reversing them on an undo would mean a member who mis-tapped, corrected it, and then genuinely
 * finished the lesson would end up with LESS than a member who never mis-tapped — the correction
 * would cost them. So this removes the progress row and nothing else: the syllabus tick and the
 * progress bar go back, anything already earned stays earned. Re-completing later is a no-op on
 * the grant side precisely because those paths are once-ever.
 *
 * No reward events are computed or returned, because none fire: rewardEventsForTransition reads a
 * FORWARD transition, and there is no "phase un-completed" event in the model.
 */
export async function uncompleteJourneyLessonAction(
  slug: string,
  itemId: string,
): Promise<ActionResult<null>> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Sign in to track your progress.')
  const loaded = await getPlan(slug)
  if (!loaded) return fail('Journey not found.')

  const unticked = await uncompleteLesson(caller.id, itemId)
  if (!unticked.ok) return fail(unticked.error)

  revalidatePath(`/journeys/${slug}/learn`)
  return ok(null)
}
