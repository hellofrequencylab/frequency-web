'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { BarChart3 } from 'lucide-react'
import { moduleById } from '@/lib/admin/modules/registry'
import { getHubInsightsData, type HubInsightsData } from '@/app/(main)/hubs/admin-actions'

// In-place "Insights" module (ADMIN-RAIL.md Phase 7, the 'insights' spine cell for hubs). Renders in
// the page admin dock on /hubs/[slug]; the server returns null unless the caller holds hub.manage.
// A read-only rollup: members reached, circles running (and how many active), and the average per
// circle — the same numbers the detail page's scoped Insight band shows.

export function HubInsightsModule() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/hubs\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<HubInsightsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    let active = true
    getHubInsightsData(slug)
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

  const mod = moduleById('hub.insights')
  const Icon = mod?.Icon ?? BarChart3

  const stats = [
    { label: 'Members', value: data.totalMembers },
    { label: 'Circles', value: data.circleCount },
    { label: 'Active circles', value: data.activeCircleCount },
    { label: 'Avg / circle', value: data.avgPerCircle },
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
      </section>
    </div>
  )
}
