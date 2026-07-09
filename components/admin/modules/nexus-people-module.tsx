'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { getNexusPeopleData, type NexusPeopleData } from '@/app/(main)/nexuses/admin-actions'

// In-place "People" module (ADMIN-RAIL.md Phase 7, the 'people' spine cell for nexuses). Renders in
// the page admin dock on /nexuses/[slug]; the server returns null unless the caller holds nexus.manage.
// Summarises the hubs inside the nexus (members behind each), names the mentor, and lists the first
// slice of hubs.

export function NexusPeopleModule() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/nexuses\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<NexusPeopleData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    let active = true
    getNexusPeopleData(slug)
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
        {/* Counts — the nexus at a glance. */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Hubs', value: data.hubCount },
            { label: 'Members', value: data.totalMembers },
            {
              label: 'Avg / hub',
              value: data.hubCount > 0 ? Math.round(data.totalMembers / data.hubCount) : 0,
            },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-surface p-3">
              <div className="text-lg font-bold text-text">{s.value}</div>
              <div className="text-2xs font-medium uppercase tracking-wide text-subtle">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Mentor. */}
        {data.mentorName && (
          <p className="mt-3 text-xs text-muted">
            Mentor: <span className="font-medium text-text">{data.mentorName}</span>
            {data.mentorHandle && <span className="text-subtle"> @{data.mentorHandle}</span>}
          </p>
        )}

        {/* Hub slice. */}
        {data.hubs.length > 0 && (
          <ul className="mt-5 space-y-2">
            {data.hubs.map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-2.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-text">{h.name}</span>
                  {h.guideName && <span className="block text-2xs text-subtle">Guide: {h.guideName}</span>}
                </span>
                <span className="shrink-0 text-2xs tabular-nums text-subtle">
                  {h.circleCount} circles · {h.memberCount} members
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
