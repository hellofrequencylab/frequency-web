'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { BarChart3 } from 'lucide-react'
import { moduleById } from '@/lib/admin/modules/registry'
import { getNexusInsightsData, type NexusInsightsData } from '@/app/(main)/nexuses/admin-actions'

// In-place "Insights" module (ADMIN-RAIL.md Phase 7, the 'insights' spine cell for nexuses). Renders
// in the page admin dock on /nexuses/[slug]; the server returns null unless the caller holds
// nexus.manage. A read-only rollup: members reached, capacity, hubs running, and the average per hub.

export function NexusInsightsModule() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/nexuses\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<NexusInsightsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    let active = true
    getNexusInsightsData(slug)
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
    return <div className="h-40 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  const mod = moduleById('nexus.insights')
  const Icon = mod?.Icon ?? BarChart3
  const fillPct = data.memberCap > 0 ? Math.min(100, Math.round((data.totalMembers / data.memberCap) * 100)) : null

  const stats = [
    { label: 'Members', value: data.totalMembers },
    { label: 'Capacity', value: data.memberCap },
    { label: 'Hubs', value: data.hubCount },
    { label: 'Avg / hub', value: data.avgPerHub },
  ]

  return (
    <div className="@container space-y-6">
      <section>
        <header className="mb-4 space-y-1">
          <h3 className="flex items-center gap-2 text-sm font-bold text-text">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-primary-strong" />}
            {mod?.label ?? 'Insights'}
          </h3>
          {mod?.desc && <p className="text-sm text-muted">{mod.desc}</p>}
        </header>

        <div className="grid grid-cols-2 gap-2 @sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-surface p-3">
              <div className="text-lg font-bold text-text tabular-nums">{s.value.toLocaleString()}</div>
              <div className="text-2xs font-medium uppercase tracking-wide text-subtle">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Capacity fill. */}
        {fillPct !== null && (
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>How full</span>
              <span className="font-medium text-text">
                {data.totalMembers} / {data.memberCap}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-elevated">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${fillPct}%` }} />
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
