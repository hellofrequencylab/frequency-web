'use client'

import { useEffect, useState } from 'react'
import { EventCompose } from '@/app/(main)/events/event-compose'
import { EventsAdminList } from '@/app/(main)/admin/events/events-admin-list'
import { loadEventsAdmin } from '@/app/(main)/admin/events/events-action'

// In-place "manage events" (ADR-138 — Spaces). Reuses EventCompose + EventsAdminList.
// Host+ via the loader; renders nothing otherwise (degrades cleanly when stacked in
// Spaces).

type Data = NonNullable<Awaited<ReturnType<typeof loadEventsAdmin>>>

export function EventsModule() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    loadEventsAdmin().then((d) => {
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
    return <div className="h-40 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <EventCompose groups={data.myCircles} />
      </div>
      <EventsAdminList upcoming={data.upcoming} past={data.past} />
    </div>
  )
}
