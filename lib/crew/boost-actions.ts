'use server'

// The client-callable seam for the Crew Boost (LIVE-756). A 'use server' module may export only
// async functions, so the rules live in lib/crew/boost.ts and this file re-checks auth and hands
// over. Caller: components/crew/boost-button.tsx (on a Circle and on a Space profile).

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { giveBoost, type BoostRefusal } from './boost'

/** Give this month's Boost to a Circle or a Space. A refusal the member can act on (not Crew, used,
 *  your own, gone) comes back as data so the button can say it in words; only a real failure is an
 *  error. */
export async function giveCrewBoost(
  kind: 'circle' | 'space',
  targetId: string,
): Promise<ActionResult<{ given: boolean; reason?: BoostRefusal }>> {
  if (kind !== 'circle' && kind !== 'space') return fail('Unknown Boost target.')
  if (typeof targetId !== 'string' || targetId.length === 0 || targetId.length > 64) return fail('Unknown Boost target.')
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to give a Boost.')
  try {
    const result = await giveBoost(profileId, kind, targetId)
    if (!result.given) return ok({ given: false, reason: result.reason })
    revalidatePath(kind === 'circle' ? '/circles' : '/spaces')
    return ok({ given: true })
  } catch (e) {
    console.error('[crew-boost] give failed', e)
    return fail('Could not give the Boost. Please try again.')
  }
}
