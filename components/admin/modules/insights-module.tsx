'use client'

import { useEffect, useState } from 'react'
import { Users, Flame, TrendingUp } from 'lucide-react'
import { StatCard } from '@/components/ui/stat-card'
import { loadEngagementSummary } from '@/app/(main)/admin/engagement/insights-action'

// In-place Insights summary (ADR-138 — the Insights category). A live at-a-glance
// header (weekly-active / verified / new / activation) above the full-dashboard
// links (Engagement, Intel, Outcomes, AI read, Segments). Fetches on mount; renders
// nothing unless the loader grants it.

type Data = NonNullable<Awaited<ReturnType<typeof loadEngagementSummary>>>

export function InsightsModule() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    loadEngagementSummary().then((d) => {
      if (active) {
        setData(d)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return <div className="h-20 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  return (
    <div className="grid grid-cols-2 gap-2">
      <StatCard label={`Weekly active`} value={data.wam} icon={Users} />
      <StatCard label="Verified (7d)" value={data.verified} icon={Flame} />
      <StatCard label={`New (${data.windowDays}d)`} value={data.newMembers} icon={TrendingUp} />
      <StatCard label="Activation" value={`${Math.round(data.activationRate * 100)}%`} icon={TrendingUp} />
    </div>
  )
}
