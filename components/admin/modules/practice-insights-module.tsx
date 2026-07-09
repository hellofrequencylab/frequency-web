'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { getPracticeInsightsData, type PracticeInsightsData } from '@/app/(main)/practices/admin-actions'

// In-place "Insights" module (ADMIN-RAIL.md Phase 7, the 'insights' spine cell for practices).
// Renders in the page admin dock on /practices/[id]; the server returns null unless the caller holds
// practice.editSettings. A read-only rollup from the practices_ranked view: people who kept the
// practice, logs in the last 30 days, and all-time logs.

export function PracticeInsightsModule() {
  const pathname = usePathname()
  const id = pathname.match(/^\/practices\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<PracticeInsightsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let active = true
    getPracticeInsightsData(id)
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
    return <div className="h-32 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  const stats = [
    { label: 'Kept it', value: data.adopters },
    { label: 'Logs · 30d', value: data.logs30d },
    { label: 'Logs · all time', value: data.logsTotal },
  ]

  return (
    <div className="@container space-y-6">
      <section>
        <div className="grid grid-cols-3 gap-2">
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
