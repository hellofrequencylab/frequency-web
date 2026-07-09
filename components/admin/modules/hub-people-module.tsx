'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { getHubPeopleData, type HubPeopleData } from '@/app/(main)/hubs/admin-actions'

// In-place "People" module (ADMIN-RAIL.md Phase 7, the 'people' spine cell for hubs — the LP-EVENT
// recipe applied to hubs). Renders in the page admin dock on /hubs/[slug]; the server returns null
// unless the caller holds hub.manage, so the module shows nothing for anyone else. Summarises the
// circles inside the hub (members, capacity fill), names the guide, and lists the first slice of
// circles with how full each is.

export function HubPeopleModule() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/hubs\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<HubPeopleData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    let active = true
    getHubPeopleData(slug)
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
    return <div className="h-48 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  return (
    <div className="@container space-y-6">
      <section>
        {/* Counts — the hub at a glance. */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Circles', value: data.circleCount },
            { label: 'Members', value: data.totalMembers },
            {
              label: 'Avg / circle',
              value: data.circleCount > 0 ? Math.round(data.totalMembers / data.circleCount) : 0,
            },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-surface p-3">
              <div className="text-lg font-bold text-text">{s.value}</div>
              <div className="text-2xs font-medium uppercase tracking-wide text-subtle">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Guide. */}
        {data.guideName && (
          <p className="mt-3 text-xs text-muted">
            Guide: <span className="font-medium text-text">{data.guideName}</span>
            {data.guideHandle && <span className="text-subtle"> @{data.guideHandle}</span>}
          </p>
        )}

        {/* Circle slice with fill. */}
        {data.circles.length > 0 && (
          <ul className="mt-5 space-y-2">
            {data.circles.map((c) => {
              const pct = c.memberCap > 0 ? Math.min(100, Math.round((c.memberCount / c.memberCap) * 100)) : 0
              return (
                <li key={c.id} className="rounded-xl border border-border bg-surface p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold text-text">{c.name}</span>
                    <span className="shrink-0 text-2xs tabular-nums text-subtle">
                      {c.memberCount} / {c.memberCap}
                    </span>
                  </div>
                  {c.hostName && <p className="mt-0.5 text-2xs text-subtle">Host: {c.hostName}</p>}
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-elevated">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
