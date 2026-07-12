'use client'

import { useEffect, useState } from 'react'
import { campaignMetricsAction } from '@/app/(main)/admin/email-studio/panel-actions'
import type { CampaignMetrics } from '@/lib/email-studio/analytics'

// Per-campaign analytics for the workspace header (Phase 6, wired into the client workspace). The
// analytics lib is server-only, so this client panel reads it through `campaignMetricsAction`. It shows
// nothing until the campaign has actually sent, so a draft's editor stays clean. Clicks are weighted over
// opens (Apple Mail Privacy inflates opens). Semantic tokens only, no hex.
export function AnalyticsInline({ campaignId }: { campaignId: string }) {
  const [metrics, setMetrics] = useState<CampaignMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function run() {
      setLoading(true)
      try {
        const res = await campaignMetricsAction(campaignId)
        if (active) setMetrics(res)
      } catch {
        if (active) setMetrics(null)
      } finally {
        if (active) setLoading(false)
      }
    }
    void run()
    return () => {
      active = false
    }
  }, [campaignId])

  // Only surface once there is a real send to report on (fail-soft: nothing while loading / unsent).
  if (loading || !metrics || !metrics.hasSent) return null

  // Legacy sends (before per-campaign tracking) have no trustworthy open/click data. Show the real
  // recipient count and say so plainly, rather than a fabricated engagement number.
  if (metrics.attributionMode === 'legacy') {
    return (
      <div className="rounded-xl border border-border bg-surface px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <Metric label="Recipients" value={metrics.attributedRecipients} />
        </div>
        <p className="mt-1 text-2xs text-subtle">Open and click tracking starts with your next send.</p>
      </div>
    )
  }

  const pct = (n: number) => `${Math.round(n * 100)}%`
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <Metric label="Delivered" value={metrics.delivered} />
        <Metric label="Opens" value={pct(metrics.openRate)} />
        <Metric label="Clicks" value={pct(metrics.clickRate)} />
        <Metric label="Bounces" value={metrics.bounced} />
        {metrics.unsubscribed > 0 && <Metric label="Unsubscribed" value={metrics.unsubscribed} />}
      </div>
      <p className="mt-1 text-2xs text-subtle">Opens are approximate (Apple Mail privacy).</p>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="font-semibold tabular-nums text-text">{value}</span>
      <span className="text-muted">{label}</span>
    </span>
  )
}
