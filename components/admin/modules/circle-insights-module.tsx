'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Zap, Flame, Users } from 'lucide-react'
import { getCircleInsightsData, type CircleInsightsData } from '@/app/(main)/circles/admin-actions'

// In-place "Insights" module (ADR-515 Phase 4, the CIRCLE rail, the 'insights' spine cell). Renders in
// the page admin rail on /circles/[slug]; the server returns null unless the caller holds
// circle.editSettings, so the module shows nothing for anyone else. An at-a-glance health readout —
// Zaps earned THROUGH this circle, active member streaks, and who joined this week — mirroring the page
// body's health panel and the sibling hub/nexus/practice insights modules. Inline (a circle has no
// standalone insights page, so there is no non-circular bank destination — see ADR-515 Phase 4).

function Stat({ label, value, Icon }: { label: string; value: string; Icon: typeof Zap }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 text-center">
      <Icon className="mx-auto mb-1 h-3.5 w-3.5 text-subtle" />
      <div className="text-lg font-bold leading-none tabular-nums text-text">{value}</div>
      <div className="mt-1 text-2xs font-medium uppercase tracking-wide text-subtle">{label}</div>
    </div>
  )
}

export function CircleInsightsModule() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/circles\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<CircleInsightsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    let active = true
    getCircleInsightsData(slug)
      .then((d) => {
        if (active) {
          setData(d)
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [slug])

  if (!slug) return null
  if (loading) {
    return <div className="h-28 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  return (
    <div className="@container grid grid-cols-3 gap-2">
      <Stat label="Zaps earned here" value={data.zapsEarned.toLocaleString()} Icon={Zap} />
      <Stat label="Active streaks" value={String(data.activeStreaks)} Icon={Flame} />
      <Stat label="New this week" value={String(data.newThisWeek)} Icon={Users} />
    </div>
  )
}
