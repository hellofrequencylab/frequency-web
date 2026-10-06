'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { isOfferLive } from '@/lib/partners/offers'
import { getMyLoyalty } from '@/lib/partners/read'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Claim a loyalty card at the counter (LIVE-710). The member shows the card to staff and taps
// Claim; the claim is a partner_redemptions row against the offer with source 'loyalty', which
// resets their visit count. No cash moves. The admin client writes, so the checks live here: the
// offer is a live loyalty card at an active partner, and THIS member has the visits for it now.
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

  const { data: claim, error } = await admin
    .from('partner_redemptions')
    .insert({ partner_id: row.partner_id, offer_id: row.id, profile_id: profileId, source: 'loyalty' })
    .select('redeemed_at')
    .single()
  if (error) return fail('Could not claim it. Please try again.')

  revalidatePath(`/partners/${row.partners.slug}`)
  return ok({ claimedAt: claim.redeemed_at })
}
