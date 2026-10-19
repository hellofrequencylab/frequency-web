// REGULARS HUNTS, the step on a check-in (LIVE-941, ADR-1781). Called by lib/engagement/capture.ts right
// after recordLoyaltyVisit stamped the member's card for the day, so this module never verifies anything:
// it asks the one writer, loyalty_hunt_progress(), which hunts the stamp moved, pays the hunt_complete
// Zaps when a hunt finished, and returns the progress list for the claim result. Best-effort: a failure
// here never breaks the check-in.

import { createAdminClient } from '@/lib/supabase/admin'
import { awardZapsForAction } from '@/lib/zaps'
import { readHuntReply, type HuntProgress } from './hunts'

interface HuntVisitResult {
  hunts: HuntProgress[]
  zapsAwarded: number
}

export async function recordHuntProgress(spaceId: string, profileId: string, day: string | null): Promise<HuntVisitResult> {
  const none: HuntVisitResult = { hunts: [], zapsAwarded: 0 }
  if (!day) return none
  try {
    const admin = createAdminClient()
    const rpc = admin.rpc.bind(admin) as unknown as (
      name: 'loyalty_hunt_progress',
      args: { _space: string; _profile: string; _day: string },
    ) => Promise<{ data: unknown; error: { message: string } | null }>
    const { data, error } = await rpc('loyalty_hunt_progress', { _space: spaceId, _profile: profileId, _day: day })
    if (error) {
      console.error('[loyalty] loyalty_hunt_progress failed', { spaceId, message: error.message })
      return none
    }
    const hunts = readHuntReply(data)
    let zapsAwarded = 0
    for (const h of hunts) {
      if (!h.earnedCode) continue
      const award = await awardZapsForAction(profileId, 'hunt_complete')
      if (award.awarded) zapsAwarded += award.amount
    }
    return { hunts, zapsAwarded }
  } catch (e) {
    console.error('[loyalty] hunt progress failed', { spaceId, message: e instanceof Error ? e.message : String(e) })
    return none
  }
}
