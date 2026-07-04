'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { JourneyDangerZone } from '@/components/journey/v2/journey-danger-zone'
import { getJourneyRailData, type JourneyRailData } from '@/app/(main)/journeys/admin-actions'

// In-place "Danger zone" module (ADR-515 Phase 6, the 'danger' spine cell). The self-contained
// JourneyDangerZone delete control (type-to-confirm) mounted inline as the de-emphasized last body item —
// NEVER banked (a destructive action is never a quick-link). Self-fetches getJourneyRailData (null unless
// journey.editSettings); the delete action itself re-checks owner-or-admin server-side.

export function JourneyDangerModule() {
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

  return <JourneyDangerZone planId={data.planId} title={data.title} />
}
