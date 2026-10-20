'use server'

// REGULARS owner actions (LIVE-940, ADR-1780). Two writes, both behind the owner gate inside ./store.ts
// (canEditProfile on the Space, or a janitor). Input is validated by the pure normalizer first, so a
// hand-driven call cannot save a card outside the limits the migration also enforces.

import { type ActionResult, ok, fail } from '@/lib/action-result'
import { getSpaceById } from '@/lib/spaces/store'
import { normalizeProgramInput, type LoyaltyProgram } from './program'
import { loyaltyEligibility, syncCheckinGeofence, writeLoyaltyProgram, writeRewardHandedOut } from './store'

export async function saveLoyaltyProgram(spaceId: string, raw: unknown): Promise<ActionResult<LoyaltyProgram>> {
  const parsed = normalizeProgramInput(raw)
  if ('error' in parsed) return fail(parsed.error)
  const saved = await writeLoyaltyProgram(spaceId, parsed.input)
  if (!saved) {
    const space = await getSpaceById(spaceId)
    const why = space ? await loyaltyEligibility(space) : null
    if (parsed.input.status === 'on' && why === 'plan') return fail('Regulars is a Business feature. Upgrade the Space to turn it on.')
    return fail('Could not save Regulars.')
  }
  const space = await getSpaceById(spaceId)
  if (space) await syncCheckinGeofence(space, saved.status === 'on' && saved.geofence)
  return ok(saved)
}

export async function handOutReward(spaceId: string, code: string): Promise<ActionResult<'done' | 'already'>> {
  const result = await writeRewardHandedOut(spaceId, typeof code === 'string' ? code : '')
  if (result === null) return fail('Could not mark that reward.')
  if (result === 'unknown') return fail('No reward with that code at this Space.')
  return ok(result)
}
