'use server'

// Witnessed awards — the quiet peer "give" action (Rewards Economy v2).
// Authz + once-per-season rules live in lib/awards/witnessed.ts.

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { grantWitnessedAward, canGrantWitnessed, type WitnessedSlug } from '@/lib/awards/witnessed'
import { type ActionResult, ok, fail } from '@/lib/action-result'

export async function giveWitnessedAward(
  recipientId: string,
  slug: WitnessedSlug,
): Promise<ActionResult> {
  const granterId = await getMyProfileId()
  if (!granterId) return fail('Not signed in')

  const result = await grantWitnessedAward(granterId, recipientId, slug)
  if (!result.ok) {
    const message =
      result.reason === 'already_granted' ? 'You’ve already given this one this season.'
      : result.reason === 'not_host' ? 'Only circle Hosts can give this.'
      : result.reason === 'not_in_circle' ? 'They’re not in a circle you host.'
      : result.reason === 'self' ? 'It has to go to someone else.'
      : 'Couldn’t give the award right now.'
    return fail(message)
  }

  revalidatePath('/people', 'layout')
  return ok()
}

/** Which witnessed awards the signed-in viewer can still give this season. */
export async function giveableAwards(): Promise<WitnessedSlug[]> {
  const granterId = await getMyProfileId()
  if (!granterId) return []
  const out: WitnessedSlug[] = []
  if (await canGrantWitnessed(granterId, 'strong_signal')) out.push('strong_signal')
  if (await canGrantWitnessed(granterId, 'carried_the_room')) out.push('carried_the_room')
  return out
}
