'use client'

import { useState, useTransition } from 'react'
import { reportContent } from '@/app/(main)/feed/report-actions'
import { isError } from '@/lib/action-result'
import { Dialog } from '@/components/ui/dialog'

type ReportDialogProps = {
  targetType: 'post' | 'dispatch' | 'comment' | 'member' | 'event'
  targetId: string
  open: boolean
  onClose: () => void
}

const REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'inappropriate', label: 'Inappropriate' },
  { value: 'misinformation', label: 'Misinformation' },
  { value: 'other', label: 'Other' },
] as const

type ReportReason = (typeof REASONS)[number]['value']

// The content-moderation report dialog (distinct from the support `ReportDialog` in
// components/support/report-dialog.tsx, which files support tickets). This one flags
// a post/comment/member/event for moderator review.
export function ContentReportDialog({ targetType, targetId, open, onClose }: ReportDialogProps) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleClose() {
    setReason(null)
    setDetails('')
    setSubmitted(false)
    setError(null)
    onClose()
  }

  function handleSubmit() {
    if (!reason) return
    setError(null)
    startTransition(async () => {
      const result = await reportContent(targetType, targetId, reason, details || undefined)
      if (isError(result)) {
        setError(result.error)
      } else {
        setSubmitted(true)
      }
    })
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      ariaLabel={`Report ${targetType}`}
      className="max-w-sm"
    >
      <div className="bg-surface rounded-2xl shadow-xl border border-border p-6 w-full">
        {submitted ? (
          <>
            <h3 className="text-sm font-semibold text-text mb-2">
              Report submitted
            </h3>
            <p className="text-xs text-muted mb-5 leading-relaxed">
              Report submitted. Our team will review it.
            </p>
            <div className="flex justify-end">
              <button
                onClick={handleClose}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary-hover transition-colors"
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-sm font-semibold text-text mb-2">
              Report {targetType}
            </h3>
            <p className="text-xs text-muted mb-4 leading-relaxed">
              Why are you reporting this? Select the reason that best applies.
            </p>

            {/* Reason radio buttons */}
            <div className="space-y-2 mb-4">
              {REASONS.map((r) => (
                <label
                  key={r.value}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                    reason === r.value
                      ? 'border-primary bg-primary-bg/50 dark:border-primary dark:bg-primary-bg'
                      : 'border-border hover:border-border-strong dark:hover:border-border-strong'
                  }`}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="accent-primary"
                  />
                  <span className="text-sm text-text">{r.label}</span>
                </label>
              ))}
            </div>

            {/* Details textarea */}
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Additional details (optional)"
              rows={3}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text dark:text-subtle/60 placeholder:text-subtle dark:placeholder:text-muted focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-border-strong/30 dark:focus:ring-border-strong/30 resize-none mb-4"
            />

            {/* Error message */}
            {error && (
              <p className="text-xs text-danger mb-3">{error}</p>
            )}

            {/* Buttons */}
            <div className="flex gap-2 justify-end">
              <button
                onClick={handleClose}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-elevated transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={!reason || isPending}
                onClick={handleSubmit}
                className="rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                {isPending ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}
