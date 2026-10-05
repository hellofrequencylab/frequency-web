'use server'

// Journeys v2 — the lesson player's complete action (ADR-252, J1b). Records a lesson check-off
// (member-owned via journey_lesson_progress) and computes which milestone rewards just
// unlocked (phase/journey complete) so the player can celebrate. The actual Gem/trophy grants
// for those events wire in J3; the events flow is in place now.

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { getPlan, completeLesson, uncompleteLesson } from '@/lib/journey-plans'
import { loadJourneyEntryFacts } from '@/lib/journeys/entry-door'
import { canEnterJourney } from '@/lib/journeys/entry-gate'
import { getMemberRunForPlan, getSoloEnrollmentStart } from '@/lib/journeys/runs'
import { isPhaseUnlocked } from '@/lib/journeys/schedule'
import { getJourneyTree } from '@/lib/journeys/store'
import type { JourneyTree } from '@/lib/journeys/tree'
import { rewardEventsForTransition, type JourneyRewardEvent } from '@/lib/journeys/rewards'
import { grantJourneyRewards, grantExtraCreditIfAny, type GrantedJourneyReward } from '@/lib/journeys/grants'

/** Is the phase holding `itemId` still drip-locked? Mirrors the phaseLock map in learn-player.tsx. */
function isLessonDripLocked(tree: JourneyTree, itemId: string, anchorStart: Date, dripIntervalDays: number): boolean {
  for (let i = 0; i < tree.phases.length; i++) {
    for (const m of tree.phases[i].modules) {
      if (m.lessons.some((l) => l.id === itemId)) return !isPhaseUnlocked(anchorStart, i, dripIntervalDays)
    }
  }
  return false
}

export async function completeJourneyLessonAction(
  slug: string,
  itemId: string,
): Promise<ActionResult<{ events: JourneyRewardEvent[]; granted: GrantedJourneyReward[]; bonusZaps: number }>> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Sign in to track your progress.')
  const loaded = await getPlan(slug)
  if (!loaded) return fail('Journey not found.')
  const planId = loaded.plan.id

  // ── THE DOOR (ADR-1397), mirrored from learn/page.tsx (SCAN-725) ────────────────────────────
  // The page admits the author, a manager or an enrolled member and nobody else. The action used to
  // admit any signed-in caller, so a member who never enrolled (or never bought) could tick every
  // lesson and collect the phase Gems, the extra-credit Zaps and a journey_complete event on content
  // they cannot open. Same helper as the page (lib/journeys/entry-door), so the two cannot drift.
  const entry = await loadJourneyEntryFacts(caller.id, loaded.plan)
  if (!canEnterJourney(entry)) return fail('Journey not found.')
  const { canManage } = entry
  // The item must belong to THIS plan: completeLesson is a bare upsert keyed by item id.
  if (!loaded.items.some((it) => it.id === itemId)) return fail('That lesson is not part of this Journey.')

  const before = await getJourneyTree(slug, caller.id)

  // The drip lock the page enforces: phase i unlocks at anchor + i × interval, where the anchor is
  // the Run's start (cohort) or the member's own enrolment start (solo). No anchor, no lock. An
  // author or manager previews freely, as on the page. Best-effort like the page's own Run read.
  if (!canManage && loaded.plan.author_id !== caller.id && before) {
    try {
      const run = await getMemberRunForPlan(caller.id, planId)
      const anchorStart = run ? run.startedAt : await getSoloEnrollmentStart(caller.id, planId)
      const dripIntervalDays = run ? run.dripIntervalDays : ((loaded.plan as { drip_interval_days?: number }).drip_interval_days ?? 7)
      if (anchorStart && isLessonDripLocked(before, itemId, new Date(anchorStart), dripIntervalDays)) {
        return fail('That lesson has not unlocked yet.')
      }
    } catch {
      /* Runs not enabled yet — no drip lock to apply */
    }
  }

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
