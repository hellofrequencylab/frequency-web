'use server'

// The player's claim from the Trail page (FH-016S). The player types or pastes the code printed at the
// stop (the same code a scan carries). The action derives the profile itself, resolves the placement
// fresh, opens a run-bound claim token and credits through claimAsPlayer, which checks scope and
// eligibility and calls hunt_claim_apply (lib/hunts/apply-claim.ts). It never takes a profile id,
// run id or mission key from the request: the placement binding picks the mission.
// A visit kept for staff review (FH-020V) answers `held` with its own words; nothing is credited.
// FH-042S: a Mystery stop takes an answer too. The answer goes to claimAsPlayer, which judges it on the
// server against the stored hash; this action only words the verdict: a missing or wrong answer
// (tries left and, from the second wrong try, the stop's hint), a locked one (pointing at the stand-in
// stop), and a stop closed because the run took the other path at a fork.
// Dark until HUNTS_CLAIMS_ENABLED is on.

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { deferHuntEvent, reasonClass } from '@/lib/hunts/analytics'
import { claimAsPlayer, loadScanPlacement, openClaim } from '@/lib/hunts/claim-store'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { evaluate } from '@/lib/hunts/graph'
import { answerRefusalWords, HELD_VISIT_MESSAGE, OTHER_PATH_MESSAGE, standInPositions } from '@/lib/hunts/player'
import { loadPlayerRun, loadPublishedTrail, loadRunCredits } from '@/lib/hunts/run-store'
import { loadUniquePlacementMission } from '@/lib/hunts/staff-store'

/**
 * `answer`: the stop is a Mystery and wants an answer (none yet, or a wrong one); the form keeps the code
 * and asks again. `locked`: no tries left on that Mystery. `hint` is the stop's own hint, when released.
 */
export type ClaimStopState = { status: 'idle' | 'credited' | 'already_credited' | 'held' | 'answer' | 'locked' | 'error'; message: string; hint?: string }

const CODE = /^[a-z0-9-]{6,80}$/
const SLUG = /^[a-z0-9-]{1,120}$/
const UPDATED = 'This Trail changed since you started. Open the Trail again to carry on.'
/** Longer input is cut on the server too (lib/hunts/mystery.ts); this only refuses a runaway body. */
const MAX_ANSWER = 200
const error = (message: string): ClaimStopState => ({ status: 'error', message })

/**
 * The stop a placement names on the Trail this player is on: the graph, the stop's key and the run's
 * credits. Only for wording a refusal, so a read that fails gives null and the plain refusal stands.
 */
async function stopContext(profileId: string, slug: string, placementId: string) {
  try {
    return await readStopContext(profileId, slug, placementId)
  } catch {
    return null
  }
}

async function readStopContext(profileId: string, slug: string, placementId: string) {
  const trail = await loadPublishedTrail(slug)
  if (!trail) return null
  const [missionKey, run] = await Promise.all([loadUniquePlacementMission(trail.huntId, trail.versionId, placementId), loadPlayerRun(trail, profileId)])
  if (!missionKey) return null
  return { trail, missionKey, credits: run ? await loadRunCredits(run.runId, profileId) : [] }
}

export async function claimStopAction(_previous: ClaimStopState, formData: FormData): Promise<ClaimStopState> {
  if (!huntSwitchOn('claims')) return error('Stops cannot be confirmed yet.')
  const slug = formData.get('slug')
  const rawCode = formData.get('code')
  if (typeof slug !== 'string' || !SLUG.test(slug) || typeof rawCode !== 'string') return error('Enter the code from the stop.')
  const code = rawCode.trim().toLowerCase()
  if (!CODE.test(code)) return error('That code does not look right. Check it and try again.')
  const rawAnswer = formData.get('answer')
  const answer = typeof rawAnswer === 'string' ? rawAnswer.trim() : ''
  if (answer.length > MAX_ANSWER) return { status: 'answer', message: 'That answer is too long. Try a shorter one.' }

  const caller = await getCallerProfile()
  if (!caller) return error('Sign in to confirm a stop.')

  const placement = await loadScanPlacement({ code })
  if (!placement || placement.revokedAt !== null || placement.huntSlug !== slug) return error('That code is not part of this Trail.')

  const nowEpoch = Math.floor(Date.now() / 1000)
  const opened = await openClaim(caller.id, placement.id, nowEpoch)
  // FH-016T: a run pinned to an earlier version of the Trail is refused before any token exists.
  if (!opened.ok) return error(opened.reason === 'version_superseded' ? UPDATED : 'This stop could not be confirmed.')

  // One key per player, run and placement: a retry or a second device replays instead of double crediting.
  const idempotencyKey = createHash('sha256').update(`play:${caller.id}:${opened.runId}:${placement.id}`).digest('hex')
  const outcome = await claimAsPlayer(caller.id, { placementId: placement.id, token: opened.token, idempotencyKey, nowEpoch, ...(answer ? { answer } : {}) })
  // FH-025: the outcome class only. The code, the placement and the stop never reach the event.
  deferHuntEvent({
    event: 'hunt.stop_claim',
    actorProfileId: caller.id,
    props: { hunt_id: placement.huntId, medium: 'typed', assurance: 'signed_node', reason_class: reasonClass(outcome.ok ? outcome.result : outcome.reason), replayed: outcome.ok && outcome.replayed },
  })
  if (!outcome.ok) {
    if (outcome.reason === 'version_superseded') return error(UPDATED)
    // FH-042S: a Mystery that wants an answer, or did not get the right one. Nothing is credited.
    if (outcome.reason === 'answer_required' || outcome.reason === 'answer_wrong') return { status: 'answer', ...answerRefusalWords(outcome) }
    if (outcome.reason === 'answer_locked') {
      const at = await stopContext(caller.id, slug, placement.id)
      // The page shows the Mystery as closed and the stand-in as the next stop.
      revalidatePath(`/hunts/${slug}/play`)
      return { status: 'locked', ...answerRefusalWords(outcome, at ? standInPositions(at.trail.graph, at.trail.content, at.missionKey) : []) }
    }
    if (outcome.reason === 'mission_not_eligible') {
      const at = await stopContext(caller.id, slug, placement.id)
      const mission = at?.trail.graph.missions.find((m) => m.mission_key === at.missionKey)
      if (at && mission?.choice_group && evaluate(at.trail.graph, at.credits, nowEpoch * 1000).status[at.missionKey] === 'closed') return error(OTHER_PATH_MESSAGE)
    }
    return error('This stop could not be confirmed.')
  }

  if (outcome.result === 'credited' || outcome.result === 'already_credited') {
    revalidatePath(`/hunts/${slug}/play`)
    return outcome.result === 'credited'
      ? { status: 'credited', message: 'Stop confirmed.' }
      : { status: 'already_credited', message: 'You already confirmed this stop.' }
  }
  // FH-020V: the stop's placement opted in to staff review, so the visit is kept, not refused. Nothing
  // is credited yet, so the page is not revalidated; a repeat gets this same answer.
  if (outcome.result === 'held') return { status: 'held', message: HELD_VISIT_MESSAGE }
  return error('This stop could not be confirmed.')
}
