'use server'

import { requireAdmin } from '@/lib/admin/guard'
import { getCampaignMetrics, type CampaignMetrics } from '@/lib/email-studio/analytics'

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
