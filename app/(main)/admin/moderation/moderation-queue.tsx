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
  spam:           { label: 'Spam',           cls: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' },
  harassment:     { label: 'Harassment',     cls: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
  inappropriate:  { label: 'Inappropriate',  cls: 'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300' },
  misinformation: { label: 'Misinformation', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300' },
  other:          { label: 'Other',          cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
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
            className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm p-4"
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
                <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400 text-xs font-semibold flex items-center justify-center shrink-0 select-none">
                  {getInitials(report.reporter.display_name)}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-50">
                    {report.reporter.display_name}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    @{report.reporter.handle}
                  </span>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Reported {relativeTime(report.created_at)}
                </p>
              </div>

              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            </div>

            {/* Target type + reason */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 font-medium">
                {targetLabel}
              </span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${reasonInfo.cls}`}>
                {reasonInfo.label}
              </span>
            </div>

            {/* Content preview */}
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 p-3 mb-3">
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                {report.preview}
              </p>
            </div>

            {/* Details */}
            {report.details && (
              <div className="mb-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
                  Reporter&apos;s note
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 italic">
                  &ldquo;{report.details}&rdquo;
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
              <button
                disabled={isPending}
                onClick={() => handleAction(report.id, 'actioned')}
                className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Take Action
              </button>
              <button
                disabled={isPending}
                onClick={() => handleAction(report.id, 'dismissed')}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
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
