'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { SetCirclePractice } from '@/components/practice/set-circle-practice'
import {
  getCirclePracticeAssignData,
  type CirclePracticeAssignData,
} from '@/app/(main)/circles/admin-actions'
import { useEntityRailRead } from './entity-rail-data'

// In-place "This week's practice" module (ADR-515 Phase 4, the CIRCLE rail, the 'engage' spine cell).
// Renders in the page admin rail on /circles/[slug]; the server returns null unless the caller holds
// circle.assignTask, so the module shows nothing for anyone else. Wraps the host practice picker (the
// SetCirclePractice control, extracted out of Circle Quest); setting the practice reuses
// setCirclePracticeAction, which re-checks circle.editSettings server-side (co-granted to a circle
// leader, so the write gate is never weaker than this read gate).

export function CirclePracticeModule() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/circles\/([^/]+)/)?.[1] ?? null
  // The first read comes from the rail's one bundled request (ADR-1685); a reload calls the getter.
  const readPractice = useEntityRailRead('circle', 'practice', getCirclePracticeAssignData)

  const [data, setData] = useState<CirclePracticeAssignData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    let active = true
    readPractice(slug)
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
  }, [slug, readPractice])

  if (!slug) return null
  if (loading) {
    return <div className="h-28 animate-pulse rounded-card border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  return (
    <div className="@container">
      <SetCirclePractice
          circleId={data.circleId}
          library={data.library}
        current={data.activePracticeId ?? undefined}
      />
    </div>
  )
}
