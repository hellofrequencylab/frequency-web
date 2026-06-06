'use client'

import { useEffect, useState } from 'react'
import { HubsClient } from '@/app/(main)/admin/hubs/hubs-client'
import { NewHubCompose } from '@/components/compose/new-hub-compose'
import { loadHubsAdmin } from '@/app/(main)/admin/hubs/hubs-admin-action'

// In-place "manage all hubs" (ADR-138 — Spaces). Reuses NewHubCompose + HubsClient.
// Guide+ via the loader; renders nothing otherwise (so it degrades cleanly when
// stacked in Spaces for a host).

type Data = NonNullable<Awaited<ReturnType<typeof loadHubsAdmin>>>

export function SpacesHubsModule() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    loadHubsAdmin().then((d) => {
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
      <NewHubCompose nexuses={data.nexuses} />
      <HubsClient hubs={data.hubs} nexuses={data.nexuses} guides={data.guides} />
    </div>
  )
}
