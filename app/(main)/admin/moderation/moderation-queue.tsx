'use client'

import { useTransition } from 'react'
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { reviewReport } from '@/app/(main)/feed/report-actions'
import { getInitials, relativeTime } from '@/lib/utils'

type ReportItem = {
  id: string
  target_type: string
  target_id: string
  reason: string
  details: string | null
  status: string
  created_at: string
  preview: string
  reporter: {
    id: string
    display_name: string
    handle: string
    avatar_url: string | null
  }
}

const REASON_BADGE: Record<string, { label: string; cls: string }> = {
  spam:           { label: 'Spam',           cls: 'bg-warning-bg text-warning dark:text-primary' },
  harassment:     { label: 'Harassment',     cls: 'bg-danger-bg text-danger dark:bg-danger-bg dark:text-danger' },
  inappropriate:  { label: 'Inappropriate',  cls: 'bg-pink-100 text-signal-strong' },
  misinformation: { label: 'Misinformation', cls: 'bg-warning-bg text-warning' },
  other:          { label: 'Other',          cls: 'bg-surface-elevated text-muted dark:bg-surface-elevated dark:text-subtle' },
}

const TARGET_LABEL: Record<string, string> = {
  post:     'Post',
  dispatch: 'Dispatch',
  comment:  'Comment',
  member:   'Member',
  event:    'Event',
}

export function ModerationQueue({ reports }: { reports: ReportItem[] }) {
  const [isPending, startTransition] = useTransition()

  function handleAction(reportId: string, action: 'actioned' | 'dismissed') {
    startTransition(async () => {
      await reviewReport(reportId, action)
    })
  }

  return (
    <div className="space-y-3">
      {reports.map((report) => {
        const reasonInfo = REASON_BADGE[report.reason] ?? REASON_BADGE.other
        const targetLabel = TARGET_LABEL[report.target_type] ?? report.target_type

        return (
          <div
            key={report.id}
            className="rounded-2xl border border-border bg-surface shadow-sm p-4"
          >
            {/* Header: reporter + timestamp */}
            <div className="flex items-start gap-3 mb-3">
              {report.reporter.avatar_url ? (
                <img
                  src={report.reporter.avatar_url}
                  alt={report.reporter.display_name}
                  className="w-8 h-8 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary-bg text-primary-strong text-xs font-semibold flex items-center justify-center shrink-0 select-none">
                  {getInitials(report.reporter.display_name)}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-medium text-text">
                    {report.reporter.display_name}
                  </span>
                  <span className="text-xs text-subtle">
                    @{report.reporter.handle}
                  </span>
                </div>
                <p className="text-xs text-subtle">
                  Reported {relativeTime(report.created_at)}
                </p>
              </div>

              <AlertTriangle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            </div>

            {/* Target type + reason */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary-bg text-primary-strong dark:bg-primary-bg dark:text-primary-strong font-medium">
                {targetLabel}
              </span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${reasonInfo.cls}`}>
                {reasonInfo.label}
              </span>
            </div>

            {/* Content preview */}
            <div className="rounded-lg bg-surface-elevated border border-border p-3 mb-3">
              <p className="text-sm text-text leading-relaxed">
                {report.preview}
              </p>
            </div>

            {/* Details */}
            {report.details && (
              <div className="mb-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle mb-1">
                  Reporter&apos;s note
                </p>
                <p className="text-sm text-muted italic">
                  &ldquo;{report.details}&rdquo;
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 pt-3 border-t border-border">
              <button
                disabled={isPending}
                onClick={() => handleAction(report.id, 'actioned')}
                className="flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Take Action
              </button>
              <button
                disabled={isPending}
                onClick={() => handleAction(report.id, 'dismissed')}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-elevated disabled:opacity-50 transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" />
                Dismiss
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
