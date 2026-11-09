// CAMPAIGN PURPOSE (SEC-CAMPAIGN-AUDIENCE). What an email IS (a promotion or a member newsletter) is the
// sender's choice and is kept apart from WHO receives it. It lives in `campaigns.audience_filter.purpose`,
// so it needs no new column. A promotional purpose is never softened by the audience it is addressed to.
import { createAdminClient } from '@/lib/supabase/admin'
import { sendCategoryForSegment, type SegmentKey } from '@/lib/studio/campaigns'

export type CampaignPurpose = 'marketing' | 'lifecycle'

/** Pure: the send-gate category. A promotional purpose wins; with none, the audience alone decides. */
export function sendCategoryForPurpose(segment: SegmentKey, purpose: CampaignPurpose | null): CampaignPurpose {
  return purpose === 'marketing' ? 'marketing' : sendCategoryForSegment(segment)
}

/** Fail-safe read: unreadable or absent is null, which leaves the audience-derived category in force. */
export async function loadCampaignPurpose(campaignId: string): Promise<CampaignPurpose | null> {
  try {
    const db = createAdminClient()
    const { data, error } = await db.from('campaigns').select('audience_filter').eq('id', campaignId).maybeSingle()
    if (error || !data) return null
    const f = (data as { audience_filter?: unknown }).audience_filter
    const v = f && typeof f === 'object' && !Array.isArray(f) ? (f as Record<string, unknown>).purpose : null
    return v === 'marketing' || v === 'lifecycle' ? v : null
  } catch {
    return null
  }
}

/** Write the purpose, keeping whatever else `audience_filter` already holds. Returns false on a refused write. */
export async function saveCampaignPurpose(campaignId: string, purpose: CampaignPurpose): Promise<boolean> {
  const db = createAdminClient()
  const { data, error } = await db.from('campaigns').select('audience_filter').eq('id', campaignId).maybeSingle()
  if (error || !data) return false
  const f = (data as { audience_filter?: unknown }).audience_filter
  const base = f && typeof f === 'object' && !Array.isArray(f) ? (f as Record<string, unknown>) : {}
  const { error: werr } = await db
    .from('campaigns')
    .update({ audience_filter: { ...base, purpose } })
    .eq('id', campaignId)
  return !werr
}
