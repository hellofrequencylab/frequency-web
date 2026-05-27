'use client'

import { useState } from 'react'
import { Flag } from 'lucide-react'
import { ReportDialog } from '@/components/report-dialog'

// TODO: When components/context-actions.tsx is built, move this "Report" action
// into ContextActions so it appears alongside other post/dispatch/member actions
// in a unified dropdown menu.

export function PostReportButton({
  targetType,
  targetId,
}: {
  targetType: 'post' | 'dispatch' | 'comment' | 'member' | 'event'
  targetId: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Report"
        className="p-1.5 rounded-md text-gray-300 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
      >
        <Flag className="w-3.5 h-3.5" />
      </button>
      <ReportDialog
        targetType={targetType}
        targetId={targetId}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
