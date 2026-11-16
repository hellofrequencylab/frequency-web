'use server'

// The player's claim from the Trail page (FH-016S). The player types or pastes the code printed at the
// stop (the same code a scan carries). The action derives the profile itself, resolves the placement
// fresh, opens a run-bound claim token and credits through claimAsPlayer, which checks scope and
// eligibility and calls hunt_claim_apply (lib/hunts/apply-claim.ts). It never takes a profile id,
// run id or mission key from the request: the placement binding picks the mission.
// Dark until HUNTS_CLAIMS_ENABLED is on.

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { claimAsPlayer, loadScanPlacement, openClaim } from '@/lib/hunts/claim-store'
import { huntSwitchOn } from '@/lib/hunts/flags'

export type ClaimStopState = { status: 'idle' | 'credited' | 'already_credited' | 'error'; message: string }

const CODE = /^[a-z0-9-]{6,80}$/
const SLUG = /^[a-z0-9-]{1,120}$/
const UPDATED = 'This Trail changed since you started. Open the Trail again to carry on.'
const error = (message: string): ClaimStopState => ({ status: 'error', message })

export async function claimStopAction(_previous: ClaimStopState, formData: FormData): Promise<ClaimStopState> {
  if (!huntSwitchOn('claims')) return error('Stops cannot be confirmed yet.')
  const slug = formData.get('slug')
  const rawCode = formData.get('code')
  if (typeof slug !== 'string' || !SLUG.test(slug) || typeof rawCode !== 'string') return error('Enter the code from the stop.')
  const code = rawCode.trim().toLowerCase()
  if (!CODE.test(code)) return error('That code does not look right. Check it and try again.')

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
  const outcome = await claimAsPlayer(caller.id, { placementId: placement.id, token: opened.token, idempotencyKey, nowEpoch })
  if (!outcome.ok) return error(outcome.reason === 'version_superseded' ? UPDATED : 'This stop could not be confirmed.')

  if (outcome.result === 'credited' || outcome.result === 'already_credited') {
    revalidatePath(`/hunts/${slug}/play`)
    return outcome.result === 'credited'
      ? { status: 'credited', message: 'Stop confirmed.' }
      : { status: 'already_credited', message: 'You already confirmed this stop.' }
  }
  return error('This stop could not be confirmed.')
}
