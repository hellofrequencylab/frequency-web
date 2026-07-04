'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { BarChart3 } from 'lucide-react'
import { moduleById } from '@/lib/admin/modules/registry'
import { getChannelInsightsData, type ChannelInsightsData } from '@/app/(main)/channels/admin-actions'

// In-place "Insights" module (ADR-515 Phase 5, the 'insights' spine cell for channels). Renders in the page
// admin dock on /channels/[id]; the server returns null unless the caller holds channel.manage (staff), so
// this shows nothing for anyone else. A read-only readout — how many are tuned in and how many circles are
// practicing it — the same two numbers the channel detail page shows.

export function ChannelInsightsModule() {
  const pathname = usePathname()
  const id = pathname.match(/^\/channels\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<ChannelInsightsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let active = true
    getChannelInsightsData(id)
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
  }, [id])

  if (!id) return null
  if (loading) {
    return <div className="h-28 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  const mod = moduleById('channel.insights')
  const Icon = mod?.Icon ?? BarChart3

  const stats = [
    { label: 'Tuned in', value: data.tunedIn },
    { label: 'Circles', value: data.circleCount },
  ]

  return (
    <div className="@container space-y-6">
      <section>
        <header className="mb-4 space-y-1">
          <h3 className="flex items-center gap-2 text-sm font-bold text-text">
            <Icon className="h-4 w-4 shrink-0 text-primary-strong" />
            {mod?.label ?? 'Insights'}
          </h3>
          {mod?.desc && <p className="text-sm text-muted">{mod.desc}</p>}
        </header>

        <div className="grid grid-cols-2 gap-2">
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
