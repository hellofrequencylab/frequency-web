'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import {
  AlertTriangle, CheckCircle, XCircle, EyeOff, MessageSquare, UserX, CalendarX, Flag,
} from 'lucide-react'
import {
  reviewReport,
  warnMember,
  suspendMember,
  cancelEventFromReport,
} from '@/app/(main)/feed/report-actions'
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
  priorReports?: number
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
  const [openSuspendFor, setOpenSuspendFor] = useState<string | null>(null)

  function handleHide(reportId: string) {
    startTransition(async () => {
      await reviewReport(reportId, 'actioned')
    })
  }

  function handleDismiss(reportId: string) {
    startTransition(async () => {
      await reviewReport(reportId, 'dismissed')
    })
  }

  function handleWarn(reportId: string, memberId: string, reason: string) {
    startTransition(async () => {
      await warnMember(reportId, memberId, reason)
    })
  }

  function handleSuspend(reportId: string, memberId: string, days: number | null, reason: string) {
    startTransition(async () => {
      await suspendMember(reportId, memberId, {
        reason,
        durationDays: days ?? undefined,
      })
      setOpenSuspendFor(null)
    })
  }

  function handleCancelEvent(reportId: string, eventId: string) {
    startTransition(async () => {
      await cancelEventFromReport(reportId, eventId)
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
                <Image
                  src={report.reporter.avatar_url}
                  alt={report.reporter.display_name}
                  width={32}
                  height={32}
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

            {/* Target type + reason + prior-report badge */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-primary-bg text-primary-strong dark:bg-primary-bg dark:text-primary-strong font-medium">
                {targetLabel}
              </span>
              <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${reasonInfo.cls}`}>
                {reasonInfo.label}
              </span>
              {report.target_type === 'member' && (report.priorReports ?? 0) > 1 && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 font-medium flex items-center gap-1">
                  <Flag className="w-3 h-3" />
                  {report.priorReports} prior report{(report.priorReports ?? 0) === 1 ? '' : 's'}
                </span>
              )}
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

            {/* Action buttons — vary by target_type */}
            <div className="flex gap-2 pt-3 border-t border-border flex-wrap">
              {/* Post / comment / dispatch → soft-hide */}
              {(report.target_type === 'post' || report.target_type === 'comment' || report.target_type === 'dispatch') && (
                <button
                  disabled={isPending}
                  onClick={() => handleHide(report.id)}
                  className="flex items-center gap-1.5 rounded-lg bg-warning px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-colors"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  Hide {targetLabel.toLowerCase()}
                </button>
              )}

              {/* Member → Warn + Suspend */}
              {report.target_type === 'member' && (
                <>
                  <button
                    disabled={isPending}
                    onClick={() => handleWarn(report.id, report.target_id, report.reason)}
                    className="flex items-center gap-1.5 rounded-lg bg-warning px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-colors"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Warn
                  </button>
                  <button
                    disabled={isPending}
                    onClick={() => setOpenSuspendFor(report.id)}
                    className="flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-colors"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    Suspend
                  </button>
                </>
              )}

              {/* Event → Cancel */}
              {report.target_type === 'event' && (
                <button
                  disabled={isPending}
                  onClick={() => handleCancelEvent(report.id, report.target_id)}
                  className="flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-colors"
                >
                  <CalendarX className="w-3.5 h-3.5" />
                  Cancel event
                </button>
              )}

              {/* Dismiss always available */}
              <button
                disabled={isPending}
                onClick={() => handleDismiss(report.id)}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-elevated disabled:opacity-50 transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" />
                Dismiss
              </button>
            </div>

            {/* Inline suspend duration picker */}
            {openSuspendFor === report.id && (
              <SuspendDurationPicker
                onCancel={() => setOpenSuspendFor(null)}
                onConfirm={(days) => handleSuspend(report.id, report.target_id, days, report.reason)}
                disabled={isPending}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function SuspendDurationPicker({
  onCancel,
  onConfirm,
  disabled,
}: {
  onCancel: () => void
  onConfirm: (days: number | null) => void
  disabled: boolean
}) {
  const options: { label: string; days: number | null }[] = [
    { label: '24 hours',   days: 1    },
    { label: '7 days',     days: 7    },
    { label: '30 days',    days: 30   },
    { label: 'Indefinite', days: null },
  ]
  return (
    <div className="mt-3 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50/60 dark:bg-red-950/30 p-3">
      <p className="text-xs font-semibold text-red-800 dark:text-red-300 mb-2">
        Suspend posting for how long?
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        {options.map(({ label, days }) => (
          <button
            key={label}
            disabled={disabled}
            onClick={() => onConfirm(days)}
            className="rounded-md bg-white dark:bg-gray-900 border border-red-200 dark:border-red-900/50 px-2.5 py-1 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/50 disabled:opacity-50 transition-colors"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <CheckCircle className="w-3 h-3 text-red-600 dark:text-red-400" />
        <p className="text-[11px] text-red-700 dark:text-red-400">
          Blocks posts, comments, and dispatches. Reading and DMs remain.
        </p>
        <button
          disabled={disabled}
          onClick={onCancel}
          className="ml-auto text-[11px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
