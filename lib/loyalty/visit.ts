// REGULARS, the stamp on a check-in (LIVE-940, ADR-1780). Called by lib/engagement/capture.ts after the
// capture pipeline has already verified the signed code, written the exactly-once ledger row and the
// captures row for THIS member-local day. So this module never re-verifies anything: it asks the one
// writer, loyalty_record_visit(), to stamp the card under its advisory lock, pays the day's Zaps through
// awardZapsForAction (zap_config 'space_checkin', 25, capped at 75 a day), and returns the card state
// for the claim result. Best-effort: a failure here never breaks the check-in.

import { createAdminClient } from '@/lib/supabase/admin'
import { awardZapsForAction } from '@/lib/zaps'
import { readVisitReply, type LoyaltyVisitOutcome } from './program'
import { getLoyaltyProgram, loyaltyEnabled } from './store'

interface LoyaltyVisitResult {
  outcome: LoyaltyVisitOutcome | null
  zapsAwarded: number
}

/**
 * Stamp the member's card at a Space for a member-local day (ISO date), pay the check-in Zaps when a
 * stamp was written, and return what the check-in result shows. Null outcome when the Space runs no
 * program, the switch is off, or the write failed.
 */
export async function recordLoyaltyVisit(spaceId: string, profileId: string, day: string | null): Promise<LoyaltyVisitResult> {
  const none: LoyaltyVisitResult = { outcome: null, zapsAwarded: 0 }
  if (!loyaltyEnabled() || !day) return none
  try {
    const program = await getLoyaltyProgram(spaceId)
    if (program.status !== 'on') return none
    const admin = createAdminClient()
    const rpc = admin.rpc.bind(admin) as unknown as (
      name: 'loyalty_record_visit',
      args: { _space: string; _profile: string; _day: string; _kind: string },
    ) => Promise<{ data: unknown; error: { message: string } | null }>
    const { data, error } = await rpc('loyalty_record_visit', { _space: spaceId, _profile: profileId, _day: day, _kind: 'visit' })
    if (error) {
      console.error('[loyalty] loyalty_record_visit failed', { spaceId, message: error.message })
      return none
    }
    const outcome = readVisitReply(data, program.rewardTitle)
    if (!outcome) return none
    const stamped = (data as { stamped?: boolean } | null)?.stamped === true
    let zapsAwarded = 0
    if (stamped) {
      const award = await awardZapsForAction(profileId, 'space_checkin')
      zapsAwarded = award.awarded ? award.amount : 0
    }
    return { outcome, zapsAwarded }
  } catch (e) {
    console.error('[loyalty] visit failed', { spaceId, message: e instanceof Error ? e.message : String(e) })
    return none
  }
}
