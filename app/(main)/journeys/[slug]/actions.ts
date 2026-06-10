'use server'

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { isPlanAdopted, setAdoptionTier } from '@/lib/journey-plans'
import type { IntensityTier } from '@/lib/journey-tiers'

// Member-facing actions for the Journey detail page (the page agent owns this file). The
// author/editor actions live in app/(main)/journeys/actions.ts (imported there, not here).
//
// The one mutation a *member* makes from this page is their personal intensity-tier override
// (docs/JOURNEYS.md §5): member override → circle default → item default → 'adept'. It only
// changes WHAT they practise, never Zap/streak math, so it's a light, self-only write.

const TIERS: readonly IntensityTier[] = ['initiate', 'adept', 'master']

/**
 * Set (or clear, with null) the signed-in member's per-Journey intensity tier. Gated to the
 * member AND to an active adoption of the plan — you can only retune a journey you're on.
 */
export async function setMyJourneyTierAction(
  planId: string,
  slug: string,
  tier: IntensityTier | null,
): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to set your intensity.')
  if (!planId) return fail('Missing journey.')
  if (tier !== null && !TIERS.includes(tier)) return fail('Unknown intensity tier.')

  // Self-only + must be adopted: the override row exists only for adopters.
  const adopted = await isPlanAdopted(profileId, planId)
  if (!adopted) return fail('Adopt this journey to set your intensity.')

  await setAdoptionTier(profileId, planId, tier)
  revalidatePath(`/journeys/${slug}`)
  return ok()
}
