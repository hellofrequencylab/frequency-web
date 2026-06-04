// Referral attribution. A scanned referral code drops an `fq_ref` cookie (the
// referrer's profile id) via the /q resolver; this applies it once, when the new
// member finishes onboarding. One-time: a member's referred_by is set only if empty.
// Server-only.

import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordEngagementEvent } from '@/lib/engagement/events'
import { awardZapsForAction } from '@/lib/zaps'
import { track } from '@/lib/analytics/track'

const REF_COOKIE = 'fq_ref'

/** Attribute `newProfileId` to the referrer in the fq_ref cookie (if any) and
 *  reward the referrer once. Best-effort: never throws, always clears the cookie. */
export async function applyReferralAttribution(newProfileId: string): Promise<void> {
  const jar = await cookies()
  const ref = jar.get(REF_COOKIE)?.value
  if (!ref || ref === newProfileId) {
    if (ref) jar.delete(REF_COOKIE)
    return
  }

  try {
    const db = createAdminClient()

    const { data: me } = await db
      .from('profiles')
      .select('referred_by_profile_id')
      .eq('id', newProfileId)
      .maybeSingle()
    if (!me || me.referred_by_profile_id) return // already attributed (or gone)

    const { data: referrer } = await db.from('profiles').select('id').eq('id', ref).maybeSingle()
    if (!referrer) return

    await db.from('profiles').update({ referred_by_profile_id: ref }).eq('id', newProfileId)

    // Reward the referrer exactly once (ledger idempotency on the pair).
    const { recorded } = await recordEngagementEvent({
      idempotencyKey: `referral:${ref}:${newProfileId}`,
      source: 'system',
      eventType: 'referral.completed',
      actorProfileId: ref,
      context: { referred: newProfileId },
    })
    if (recorded) {
      await awardZapsForAction(ref, 'invite_accepted').catch(() => {})
      void track('qr.referral_signup', { referrer: ref }, newProfileId)
    }
  } catch {
    // swallow — attribution is a bonus, never a blocker on signup
  } finally {
    jar.delete(REF_COOKIE)
  }
}
