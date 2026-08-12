'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { StartRunButton } from '@/components/journey/v2/start-run-button'
import {
  getCircleJourneyRunData,
  type CircleJourneyRunData,
} from './circle-journey-run-actions'

// In-place "Start a Run" control, stacked into the circle rail's ONE Engage box beside the shared
// challenges and this week's practice (module-map.tsx). A Run is one Circle going through one
// Journey together, so it is the same subject those two already cover: what the circle is doing
// together. It rides `circle.engage` rather than claiming a new catalog row, following ADR-846,
// which folded the separate `circle.practice` row into Engage for exactly that reason.
//
// It used to be a page block in the member-facing side column. The gate did not change with the
// move: the read (circle-journey-run-actions.ts) re-checks circle.editSettings and returns null for
// anyone else, so this renders nothing for a member, and startJourneyRunAction re-checks its own.

export function CircleJourneyRunModule() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/circles\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<CircleJourneyRunData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    let active = true
    getCircleJourneyRunData(slug)
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
    return <div className="h-32 animate-pulse rounded-card border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  return (
    <div className="@container mt-5 space-y-2 border-t border-border pt-4">
      <p className="text-meta font-semibold text-text">Start a Run</p>
      <StartRunButton circleId={data.circleId} journeys={data.journeys} />
    </div>
  )
}
