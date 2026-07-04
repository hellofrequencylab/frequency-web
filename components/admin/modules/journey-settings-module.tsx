'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { JourneySettings } from '@/components/journey/v2/journey-settings'
import { getJourneyRailData, type JourneyRailData } from '@/app/(main)/journeys/admin-actions'

// In-place "Journey settings" module (ADR-515 Phase 6, the 'basics' spine cell). The self-contained
// JourneySettings editor (identity · delivery · rewards · discovery · how the Circle gathers · publishing)
// mounted INLINE in the rail body. It self-fetches getJourneyRailData(slug), which re-resolves
// journey.editSettings and returns null for anyone else, so this renders nothing for a non-owner. The
// editor's own autosave actions each re-check ownership server-side (the gate here is UX).

export function JourneySettingsModule() {
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
    return <div className="h-40 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  return <JourneySettings {...data.settings} />
}
