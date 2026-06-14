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
import { grantJourneyRewards, type GrantedJourneyReward } from '@/lib/journeys/grants'

export async function completeJourneyLessonAction(
  slug: string,
  itemId: string,
): Promise<ActionResult<{ events: JourneyRewardEvent[]; granted: GrantedJourneyReward[] }>> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Sign in to track your progress.')
  const loaded = await getPlan(slug)
  if (!loaded) return fail('Journey not found.')
  const planId = loaded.plan.id

  const before = await getJourneyTree(slug, caller.id)
  await completeLesson(caller.id, planId, itemId)
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

  revalidatePath(`/journeys/${slug}/learn`)
  return ok({ events, granted })
}

export async function uncompleteJourneyLessonAction(slug: string, itemId: string): Promise<ActionResult> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Sign in first.')
  await uncompleteLesson(caller.id, itemId)
  revalidatePath(`/journeys/${slug}/learn`)
  return ok()
}
