'use client'

import { useEffect, useState } from 'react'
import { DemoOverview } from '@/app/(main)/admin/demo/demo-overview'
import { StudioWizard } from '@/app/(main)/admin/demo/studio/studio-wizard'
import { GrowNetwork } from '@/app/(main)/admin/demo/grow-network'
import { DangerZone } from '@/app/(main)/admin/demo/danger-zone'
import { loadDemo } from '@/app/(main)/admin/demo/demo-action'

// In-place Demo Studio (ADR-138 — Platform). Renders the existing Demo overview,
// area wizard, grow-network tools, and danger zone inside the page admin console.
// Janitor-only via the loader (its generate/purge actions re-check too).

type Data = NonNullable<Awaited<ReturnType<typeof loadDemo>>>

const DEFAULT_LOCATION = { name: 'Encinitas', lat: 33.0369, lng: -117.292 }

export function DemoModule() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    loadDemo().then((d) => {
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
    return <div className="h-48 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  return (
    <div className="space-y-4">
      <DemoOverview enabled={data.enabled} counts={data.counts} total={data.total} />
      <StudioWizard channels={data.channels} />
      <GrowNetwork circles={data.demoCircles} channels={data.channels} />
      <DangerZone total={data.total} counts={data.counts} circles={data.demoCircles} defaultLocation={DEFAULT_LOCATION} />
    </div>
  )
}
