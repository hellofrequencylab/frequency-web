'use server'

// REGULARS HUNT actions (LIVE-942, ADR-1781). Every write runs behind the owner gate inside ./hunt-store.ts:
// the HOST's owner creates, edits, invites and changes status; an INVITED Space's owner answers its
// invite. Input is validated by the pure normalizer first.

import { type ActionResult, ok, fail } from '@/lib/action-result'
import { getSpaceById } from '@/lib/spaces/store'
import { normalizeHuntInput, type LoyaltyHunt } from './hunts'
import { writeHunt, writeHuntInvite, writeHuntReply, writeHuntStatus } from './hunt-store'
import { loyaltyEligibility } from './store'

export async function createHunt(spaceId: string, raw: unknown): Promise<ActionResult<LoyaltyHunt>> {
  const parsed = normalizeHuntInput(raw)
  if ('error' in parsed) return fail(parsed.error)
  const hunt = await writeHunt(spaceId, parsed.input)
  if (hunt) return ok(hunt)
  const space = await getSpaceById(spaceId)
  const why = space ? await loyaltyEligibility(space) : null
  if (why === 'no_location') return fail('Add the address and map pin in Profile before hosting a hunt.')
  if (why === 'plan') return fail('Hunts are a Business feature. Upgrade the Space to host one.')
  return fail('Could not create the hunt.')
}

export async function inviteHuntStop(spaceId: string, huntId: string, stopSlug: string): Promise<ActionResult<'done' | 'already'>> {
  const result = await writeHuntInvite(spaceId, typeof huntId === 'string' ? huntId : '', typeof stopSlug === 'string' ? stopSlug : '')
  if (result === null) return fail('Could not invite that Space.')
  if (result === 'unknown') return fail('No Space with that link. Paste the part after frequencylocal.com/spaces/.')
  if (result === 'not_running') return fail('That Space has not turned Regulars on yet. Ask them to, then invite them.')
  if (result === 'full') return fail('A hunt holds twelve stops.')
  return ok(result)
}

export async function answerHuntInvite(spaceId: string, huntId: string, accept: boolean): Promise<ActionResult<void>> {
  const result = await writeHuntReply(spaceId, typeof huntId === 'string' ? huntId : '', accept === true)
  return result ? ok() : fail('Could not answer that invite.')
}

export async function setHuntStatus(spaceId: string, huntId: string, next: 'live' | 'ended'): Promise<ActionResult<void>> {
  const result = await writeHuntStatus(spaceId, typeof huntId === 'string' ? huntId : '', next === 'live' ? 'live' : 'ended')
  if (result === null) return fail('Could not change the hunt.')
  if ('error' in result) return fail(result.error)
  return ok()
}
