'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Archive } from 'lucide-react'
import { moduleById } from '@/lib/admin/modules/registry'
import { JourneyExport } from '@/components/journey/v2/journey-export'
import { getJourneyRailData, type JourneyRailData } from '@/app/(main)/journeys/admin-actions'

// In-place "Export" module (ADR-515 Phase 6, the 'reach' spine cell). The self-contained JourneyExport
// control (it takes only the slug) mounted inline: saves a portable copy of the Journey to import into
// another Space. Self-fetches getJourneyRailData (null unless journey.editSettings), so it renders nothing
// for a non-owner; the export action itself re-checks ownership server-side.

export function JourneyExportModule() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/journeys\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<JourneyRailData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    let active = true
    getJourneyRailData(slug)
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
    return <div className="h-20 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  const mod = moduleById('journey.export')
  const Icon = mod?.Icon ?? Archive

  return (
    <div className="@container space-y-3">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-bold text-text">
          <Icon className="h-4 w-4 shrink-0 text-subtle" />
          {mod?.label ?? 'Export'}
        </h3>
      </header>
      <JourneyExport slug={data.slug} />
    </div>
  )
}
