'use client'

import { useEffect, useState } from 'react'
import { NewChannelCompose } from '@/components/compose/new-channel-compose'
import { ChannelsAdminList } from '@/app/(main)/admin/channels/channels-admin-list'
import { loadChannelsAdmin } from '@/app/(main)/admin/channels/channels-action'

// In-place "manage channels" (ADR-138 — Spaces). Reuses NewChannelCompose +
// ChannelsAdminList. Host+ via the loader; renders nothing otherwise (degrades
// cleanly when stacked in Spaces).

type Data = NonNullable<Awaited<ReturnType<typeof loadChannelsAdmin>>>

export function ChannelsModule() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    loadChannelsAdmin().then((d) => {
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
      {data.scopeOptions.length > 0 && (
        <div className="flex justify-end">
          <NewChannelCompose scopeOptions={data.scopeOptions} />
        </div>
      )}
      <ChannelsAdminList visible={data.visible} hidden={data.hidden} />
    </div>
  )
}
