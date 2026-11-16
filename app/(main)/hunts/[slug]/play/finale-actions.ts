'use server'

// The finale's two taps on the player's Trail page (FH-031T).
//
// Collect a reward: the completion reward on a Hunt with an Event finale is granted only to a player the
// Event admits. The action reads the finale for this player's run (loadRallyFinale) and asks through
// grantFinaleReward, which never calls the database for a player without a seat; hunt_reward_grant then
// repeats the seat check in SQL (migration 20270346086000_hunt_finale_reward_gate.sql). Dark until
// HUNTS_REWARDS_ENABLED is on.
//
// Check in at the Event stop: a stop bound to an `event` placement credits through hunt_claim_apply with
// finaleDoorEvidence at assurance `event_door`, which exists only when the host marked the player's seat
// at the finale Event. A player's own check-in is not door evidence. Dark until HUNTS_CLAIMS_ENABLED is on.
//
// Neither action takes a profile id, run id, mission or placement from the request: the profile is the
// signed-in caller, the run is theirs on the published version, and the version binding picks the stop.
// Neither one can create a seat, a ticket or an RSVP.

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { deferHuntEvent, reasonClass } from '@/lib/hunts/analytics'
import { applyClaim } from '@/lib/hunts/apply-claim'
import { loadFinaleStop } from '@/lib/hunts/finale-store'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { finaleDoorEvidence, finaleRefusalMessage, grantFinaleReward } from '@/lib/hunts/rally-finale'
import { loadRallyFinale } from '@/lib/hunts/rally-finale-store'
import { grantMessage } from '@/lib/hunts/rewards'
import { loadPlayerRun, loadPublishedTrail } from '@/lib/hunts/run-store'
import { huntRpc } from '@/lib/hunts/staff-store'

export type FinaleActionState = { status: 'idle' | 'done' | 'error'; message: string }

type FinaleRefusal = Parameters<typeof finaleRefusalMessage>[0]

const SLUG = /^[a-z0-9-]{1,120}$/
const REWARD_KEY = /^[a-z0-9_-]{1,40}$/
const error = (message: string): FinaleActionState => ({ status: 'error', message })
const key = (...parts: string[]) => createHash('sha256').update(parts.join(':')).digest('hex')

/** The signed-in caller's run on the published Trail, with the finale read for that run. */
async function playerFinale(slug: unknown) {
  if (typeof slug !== 'string' || !SLUG.test(slug)) return null
  const caller = await getCallerProfile()
  if (!caller) return null
  const trail = await loadPublishedTrail(slug)
  if (!trail) return null
  const run = await loadPlayerRun(trail, caller.id)
  if (!run) return null
  const finale = await loadRallyFinale(run.runId, caller.id, new Date().toISOString()).catch(() => null)
  if (!finale) return null
  return { slug, profileId: caller.id, trail, run, finale }
}

export async function collectFinaleRewardAction(_previous: FinaleActionState, formData: FormData): Promise<FinaleActionState> {
  if (!huntSwitchOn('rewards')) return error('Rewards are not open yet.')
  const rewardKey = formData.get('reward')
  if (typeof rewardKey !== 'string' || !REWARD_KEY.test(rewardKey)) return error('We could not find that reward.')
  const ctx = await playerFinale(formData.get('slug'))
  if (!ctx) return error('Sign in and open the Trail to collect a reward.')

  // One key per player, run and reward: a retry or a second device replays instead of granting twice.
  const out = await grantFinaleReward(
    huntRpc(),
    { actorId: ctx.profileId, runId: ctx.run.runId, rewardKey, idempotencyKey: key('finale-reward', ctx.profileId, ctx.run.runId, rewardKey) },
    ctx.finale,
  )
  if (out.result === 'not_admitted') {
    // The app refused before the database, or the database refused on its own seat check (`no_seat` or
    // `event_unavailable`). Either way the reason is a finale refusal; one this build does not know reads as no seat.
    return error(finaleRefusalMessage((out.reason ?? 'no_seat') as FinaleRefusal))
  }
  if (out.result === 'granted' || out.result === 'already_granted') {
    revalidatePath(`/hunts/${ctx.slug}/play`)
    return { status: 'done', message: grantMessage(out) }
  }
  return error(grantMessage(out))
}

export async function checkInAtFinaleAction(_previous: FinaleActionState, formData: FormData): Promise<FinaleActionState> {
  if (!huntSwitchOn('claims')) return error('Stops cannot be confirmed yet.')
  const ctx = await playerFinale(formData.get('slug'))
  if (!ctx) return error('Sign in and open the Trail to check in.')

  const evidence = finaleDoorEvidence(ctx.finale)
  if (!evidence) return error('The host marks you in at the door. Once they have, check in here.')
  const stop = await loadFinaleStop({ huntId: ctx.trail.huntId, versionId: ctx.trail.versionId })
  if (!stop) return error('This Trail has no stop at the finale.')

  const outcome = await applyClaim(huntRpc(), {
    actorId: ctx.profileId,
    runId: ctx.run.runId,
    missionKey: stop.missionKey,
    placementId: stop.placementId,
    evidenceId: evidence.evidenceId,
    assurance: evidence.assurance,
    idempotencyKey: key('finale-door', ctx.profileId, ctx.run.runId, stop.placementId),
  }).catch(() => null)
  if (!outcome) return error('This stop could not be confirmed. Try again.')
  // FH-025: the outcome class only. The Event, the seat and the stop never reach the event.
  deferHuntEvent({
    event: 'hunt.stop_claim',
    actorProfileId: ctx.profileId,
    props: { hunt_id: ctx.trail.huntId, medium: 'event', assurance: 'event_door', reason_class: reasonClass(outcome.result), replayed: outcome.replayed },
  })
  if (outcome.result === 'credited' || outcome.result === 'already_credited' || outcome.result === 'duplicate_evidence') {
    revalidatePath(`/hunts/${ctx.slug}/play`)
    return { status: 'done', message: outcome.result === 'credited' ? 'Finale stop confirmed.' : 'You already confirmed the finale stop.' }
  }
  return error('This stop could not be confirmed.')
}
