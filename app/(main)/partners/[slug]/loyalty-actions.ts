'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { isOfferLive } from '@/lib/partners/offers'
import { getMyLoyalty } from '@/lib/partners/read'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Claim a loyalty card at the counter (LIVE-710). The member shows the card to staff and taps
// Claim; the claim is a partner_redemptions row against the offer with source: 'loyalty', which
// resets their visit count. No cash moves. The admin client writes through claim_loyalty_reward,
// so the checks live here and in the RPC: the offer is a live loyalty card at an active partner,
// and THIS member has the visits for it now.
export async function claimLoyaltyReward(offerId: string): Promise<ActionResult<{ claimedAt: string }>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to claim your reward.')
  if (typeof offerId !== 'string' || !UUID.test(offerId)) return fail('That reward could not be read.')

  const admin = createAdminClient()
  const { data: offer } = await admin
    .from('partner_offers')
    .select('id, partner_id, active, valid_until, visits_required, partners!partner_id ( slug, status )')
    .eq('id', offerId)
    .maybeSingle()
  const row = offer as unknown as {
    id: string
    partner_id: string
    active: boolean
    valid_until: string | null
    visits_required: number | null
    partners: { slug: string; status: string } | null
  } | null
  if (!row || !row.visits_required || row.partners?.status !== 'active' || !isOfferLive(row)) {
    return fail('That loyalty card is not running right now.')
  }

  const progress = (await getMyLoyalty(profileId, row.partner_id, [{ id: row.id, visitsRequired: row.visits_required }])).get(row.id)
  if (!progress?.earned) {
    return fail(`Visit ${row.visits_required - (progress?.visits ?? 0)} more time${row.visits_required - (progress?.visits ?? 0) === 1 ? '' : 's'} to earn this one.`)
  }

  // Claim ATOMICALLY: claim_loyalty_reward (migration 20270346010100) takes
  // pg_advisory_xact_lock on (member, card), rechecks visits since the last loyalty
  // claim of THIS card, and inserts only if the card is still earned, closing the
  // read-then-insert double-claim the pre-check above cannot close (SCAN-841).
  const { data: claimedAt, error } = await admin.rpc('claim_loyalty_reward', {
    _profile: profileId,
    _offer: row.id,
  })
  if (error) {
    if (error.message?.includes('not_running')) {
      return fail('That loyalty card is not running right now.')
    }
    console.error('[claimLoyaltyReward] claim_loyalty_reward failed', error.message)
    return fail('Could not claim it. Please try again.')
  }
  if (typeof claimedAt !== 'string' || !claimedAt) {
    return fail('Could not claim it. Please try again.')
  }

  revalidatePath(`/partners/${row.partners.slug}`)
  return ok({ claimedAt })
}
