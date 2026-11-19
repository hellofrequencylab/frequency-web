'use client'

import { useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import type { ReportTargetType } from '@/app/(main)/feed/report-actions'

// The dialog (and the report server action behind it) loads on the first tap, never with the page:
// this control sits under every comment in every feed, on every profile and on every event page.
const ContentReportDialog = dynamic(
  () => import('@/components/report-dialog').then((m) => m.ContentReportDialog),
  { ssr: false },
)

/**
 * A "Report" control for a surface with no overflow menu (LIVE-2389): a comment row, a member
 * profile's secondary links, an event's action row. It opens the SAME `ContentReportDialog` and
 * `reportContent` action the post menu uses (components/context-actions.tsx). The caller passes the
 * neighbouring control's own classes, so the entry reads as one of the row it joins, and decides who
 * sees it (signed in, and never the author, the member themself or the event's host).
 */
export function ReportLink({
  targetType,
  targetId,
  className,
  icon,
}: {
  targetType: ReportTargetType
  targetId: string
  className?: string
  icon?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  // Mounted on the first open and kept, so closing runs the dialog's own reset and exit.
  const [loaded, setLoaded] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setLoaded(true)
          setOpen(true)
        }}
        className={className}
      >
        {icon}
        Report
      </button>
      {loaded && (
        <ContentReportDialog
          targetType={targetType}
          targetId={targetId}
          open={open}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
