'use client'

import { useEffect, useState } from 'react'
import { DispatchesClient } from '@/app/(main)/admin/dispatches/dispatches-client'
import { BroadcastCompose } from '@/app/(main)/broadcast/broadcast-compose'
import { loadBroadcasts } from '@/app/(main)/admin/dispatches/broadcasts-action'

// In-place Broadcasts (ADR-138 — Comms). Renders the existing compose + list inside
// the page admin console, so an operator broadcasts to their people without leaving
// the page. Fetches on mount via a capability-gated action; renders nothing unless
// the viewer is an operator (compose/publish actions re-check their own auth).

type Data = NonNullable<Awaited<ReturnType<typeof loadBroadcasts>>>

export function BroadcastsModule() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    loadBroadcasts().then((d) => {
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
      <BroadcastCompose circles={data.circles} hubs={data.hubs} nexuses={data.nexuses} />
      <DispatchesClient
        dispatches={data.dispatches}
        role={data.role as 'host' | 'guide' | 'mentor' | 'admin' | 'janitor'}
        circles={data.circles}
        hubs={data.hubs}
        nexuses={data.nexuses}
        tasks={data.tasks}
      />
    </div>
  )
}
