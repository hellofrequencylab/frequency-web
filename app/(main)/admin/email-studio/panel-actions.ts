'use server'

import { requireAdmin } from '@/lib/admin/guard'
import {
  getCampaignMetrics,
  getCampaignTimeline,
  type CampaignMetrics,
  type CampaignTimeline,
} from '@/lib/email-studio/analytics'
import { analyzeCampaignOpenRate, type CampaignCoachResult } from '@/lib/ai/campaign-coach'

// The read-only bridge that lets the CLIENT Email Studio workspace show per-campaign analytics
// (Phase 6) for the currently selected campaign. The analytics lib is server-only; this gated action
// is the seam the client `AnalyticsInline` calls. Read floor matches the rest of the Studio.
export async function campaignMetricsAction(campaignId: string): Promise<CampaignMetrics | null> {
  await requireAdmin('admin', { staff: 'marketing', staffLevel: 'read' })
  try {
    return await getCampaignMetrics(campaignId)
  } catch {
    return null
  }
}

/** The daily open/click timeline for a campaign, for the sparkline in the expanded stats row. Read floor. */
export async function campaignTimelineAction(campaignId: string): Promise<CampaignTimeline | null> {
  await requireAdmin('admin', { staff: 'marketing', staffLevel: 'read' })
  try {
    return await getCampaignTimeline(campaignId)
  } catch {
    return null
  }
}

/** Vera's open-rate analysis for one sent campaign. Spends AI budget, so it takes the WRITE gate (not
 *  read-only) and passes the operator's profile for the usage ledger. Fail-soft to `{ ok:false }`. */
export async function campaignCoachAction(campaignId: string): Promise<CampaignCoachResult> {
  const { profileId } = await requireAdmin('admin', { staff: 'marketing' })
  try {
    return await analyzeCampaignOpenRate(campaignId, profileId)
  } catch {
    return { ok: false, reason: 'Vera could not run the analysis just now. The stats above are still live.' }
  }
}
