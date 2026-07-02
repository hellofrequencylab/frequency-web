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
import { isError } from '@/lib/action-result'
import { getInitials, relativeTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'

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
  inappropriate:  { label: 'Inappropriate',  cls: 'bg-signal-bg text-signal-strong' },
  misinformation: { label: 'Misinformation', cls: 'bg-warning-bg text-warning' },
  other:          { label: 'Other',          cls: 'bg-surface-elevated text-muted dark:bg-surface-elevated dark:text-subtle' },
}

const TARGET_LABEL: Record<string, string> = {
  post:     'Post',
  dispatch: 'Broadcast',
  comment:  'Comment',
  member:   'Member',
  event:    'Event',
}

export function ModerationQueue({ reports }: { reports: ReportItem[] }) {
  const [isPending, startTransition] = useTransition()
  const [openSuspendFor, setOpenSuspendFor] = useState<string | null>(null)
  // Surface a failed moderation action instead of silently swallowing it — a failed
  // suspend/cancel/hide must never look like it worked.
  const [error, setError] = useState<string | null>(null)

  function handleHide(reportId: string) {
    setError(null)
    startTransition(async () => {
      const r = await reviewReport(reportId, 'actioned')
      if (isError(r)) setError(r.error)
    })
  }

  function handleDismiss(reportId: string) {
    setError(null)
    startTransition(async () => {
      const r = await reviewReport(reportId, 'dismissed')
      if (isError(r)) setError(r.error)
    })
  }

  function handleWarn(reportId: string, memberId: string, reason: string) {
    setError(null)
    startTransition(async () => {
      const r = await warnMember(reportId, memberId, reason)
      if (isError(r)) setError(r.error)
    })
  }

  function handleSuspend(reportId: string, memberId: string, days: number | null, reason: string) {
    setError(null)
    startTransition(async () => {
      const r = await suspendMember(reportId, memberId, {
        reason,
        durationDays: days ?? undefined,
      })
      if (isError(r)) {
        setError(r.error)
        return
      }
      setOpenSuspendFor(null)
    })
  }

  function handleCancelEvent(reportId: string, eventId: string) {
    setError(null)
    startTransition(async () => {
      const r = await cancelEventFromReport(reportId, eventId)
      if (isError(r)) setError(r.error)
    })
  }

  return (
    <div className="space-y-3">
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger-bg/40 px-3 py-2 text-xs font-medium text-danger"
        >
          {error}
        </p>
      )}
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
              <span className="text-xs px-2 py-0.5 rounded-md bg-primary-bg text-primary-strong dark:bg-primary-bg dark:text-primary-strong font-medium">
                {targetLabel}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${reasonInfo.cls}`}>
                {reasonInfo.label}
              </span>
              {report.target_type === 'member' && (report.priorReports ?? 0) > 1 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-danger-bg text-danger font-medium flex items-center gap-1">
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
                <p className="text-sm font-bold text-text mb-1">
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
                <Button
                  variant="warning"
                  size="sm"
                  disabled={isPending}
                  onClick={() => handleHide(report.id)}
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  Hide {targetLabel.toLowerCase()}
                </Button>
              )}

              {/* Member → Warn + Suspend */}
              {report.target_type === 'member' && (
                <>
                  <Button
                    variant="warning"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleWarn(report.id, report.target_id, report.reason)}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Warn
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={isPending}
                    onClick={() => setOpenSuspendFor(report.id)}
                  >
                    <UserX className="w-3.5 h-3.5" />
                    Suspend
                  </Button>
                </>
              )}

              {/* Event → Cancel */}
              {report.target_type === 'event' && (
                <Button
                  variant="danger"
                  size="sm"
                  disabled={isPending}
                  onClick={() => handleCancelEvent(report.id, report.target_id)}
                >
                  <CalendarX className="w-3.5 h-3.5" />
                  Cancel event
                </Button>
              )}

              {/* Dismiss always available */}
              <Button
                variant="secondary"
                size="sm"
                disabled={isPending}
                onClick={() => handleDismiss(report.id)}
              >
                <XCircle className="w-3.5 h-3.5" />
                Dismiss
              </Button>
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
    <div className="mt-3 rounded-lg border border-danger/40 bg-danger-bg p-3">
      <p className="text-xs font-semibold text-danger mb-2">
        Suspend posting for how long?
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        {options.map(({ label, days }) => (
          <button
            key={label}
            disabled={disabled}
            onClick={() => onConfirm(days)}
            className="rounded-md bg-surface border border-danger/40 px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger-bg disabled:opacity-50 transition-colors"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <CheckCircle className="w-3 h-3 text-danger" />
        <p className="text-xs text-danger">
          Blocks posts, comments, and dispatches. Reading and DMs remain.
        </p>
        <button
          disabled={disabled}
          onClick={onCancel}
          className="ml-auto text-xs text-subtle hover:text-text"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
