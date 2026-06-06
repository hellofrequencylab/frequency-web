'use client'

import { useEffect, useState } from 'react'
import { ModerationQueue } from '@/app/(main)/admin/moderation/moderation-queue'
import { loadModerationQueue } from '@/app/(main)/admin/moderation/queue-action'

// In-place Moderation queue (ADR-138 — Safety). Renders the existing ModerationQueue
// inside the page admin console (the dock's Safety category), so a moderator never
// leaves the page to clear reports. Fetches on mount via a capability-gated action
// and renders nothing unless the viewer may moderate (the resolve actions re-check
// their own authorization in feed/report-actions).

type Reports = NonNullable<Awaited<ReturnType<typeof loadModerationQueue>>>

export function ModerationModule() {
  const [reports, setReports] = useState<Reports | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    loadModerationQueue().then((r) => {
      if (active) {
        setReports(r)
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
  if (reports === null) return null
  if (reports.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface/50 px-4 py-6 text-center text-sm text-muted">
        No pending reports.
      </div>
    )
  }
  return <ModerationQueue reports={reports} />
}
