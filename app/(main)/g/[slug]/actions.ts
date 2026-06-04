'use server'

// "Gift a zap" — a scanner gives the code's owner a zap. Idempotent per
// (giver, owner, day) via the engagement ledger, so re-tapping the confirm button
// can't farm zaps. Physical/social source = 'p2p'.

import { getMyProfileId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordEngagementEvent } from '@/lib/engagement/events'
import { awardZaps } from '@/lib/zaps'
import { ok, fail, type ActionResult } from '@/lib/action-result'

const GIFT_ZAPS = 1

export async function giftZap(slug: string): Promise<ActionResult<{ awarded: boolean }>> {
  const me = await getMyProfileId()
  if (!me) return fail('Sign in to send a zap.')

  const db = createAdminClient()
  const { data: code } = await db
    .from('qr_codes')
    .select('owner_profile_id, active, purpose')
    .eq('slug', slug)
    .maybeSingle()
  if (!code || !code.active || code.purpose !== 'gift_zap' || !code.owner_profile_id) {
    return fail('This code isn’t active.')
  }
  if (code.owner_profile_id === me) return fail('You can’t gift yourself a zap.')

  const day = new Date().toISOString().slice(0, 10)
  const { recorded } = await recordEngagementEvent({
    idempotencyKey: `gift_zap:${code.owner_profile_id}:${me}:${day}`,
    source: 'p2p',
    eventType: 'gift.zap',
    actorProfileId: me,
    context: { to: code.owner_profile_id },
  })
  if (recorded) await awardZaps(code.owner_profile_id, GIFT_ZAPS)

  return ok({ awarded: recorded })
}
