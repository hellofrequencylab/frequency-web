'use client'

import { useEffect, useState } from 'react'
import { NexusesClient } from '@/app/(main)/admin/nexuses/nexuses-client'
import { NewNexusCompose } from '@/components/compose/new-nexus-compose'
import { loadNexusesAdmin } from '@/app/(main)/admin/nexuses/nexuses-admin-action'

// In-place "manage all nexuses" (ADR-138 — Spaces). Reuses NewNexusCompose +
// NexusesClient. Mentor+ via the loader; renders nothing otherwise (degrades cleanly
// when stacked in Spaces).

type Data = NonNullable<Awaited<ReturnType<typeof loadNexusesAdmin>>>

export function SpacesNexusesModule() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    loadNexusesAdmin().then((d) => {
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
      <NewNexusCompose outposts={data.outposts} />
      <NexusesClient nexuses={data.nexuses} mentors={data.mentors} />
    </div>
  )
}
