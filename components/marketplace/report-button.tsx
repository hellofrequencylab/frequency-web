'use client'

import { useState, useTransition } from 'react'
import { Flag } from 'lucide-react'
import { reportTargetAction } from '@/app/(main)/marketplace/report-actions'
import type { ReportTargetKind } from '@/lib/commerce/reports'

const REASONS = ['Spam or scam', 'Prohibited item', 'Misleading', 'Offensive', 'Other'] as const

// Quiet, member-facing report control for a listing/product/profile. Opens a small
// reason picker; files into marketplace_reports for the operator queue.
export function ReportButton({ targetKind, targetId }: { targetKind: ReportTargetKind; targetId: string }) {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (done) return <p className="text-xs text-subtle">Thanks. Our team will take a look.</p>

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs text-subtle transition-colors hover:text-text"
      >
        <Flag className="h-3.5 w-3.5" aria-hidden />
        Report
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {REASONS.map((reason) => (
        <button
          key={reason}
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null)
              const res = await reportTargetAction(targetKind, targetId, reason)
              if (res.ok) setDone(true)
              else setError(res.error ?? 'Could not file the report.')
            })
          }
          className="rounded-full border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:bg-surface-elevated hover:text-text"
        >
          {reason}
        </button>
      ))}
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-subtle hover:text-text">
        Cancel
      </button>
      {error && <p className="w-full text-xs text-warning">{error}</p>}
    </div>
  )
}
