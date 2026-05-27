'use client'

import { useState, useTransition } from 'react'
import { reportContent } from '@/app/(main)/feed/report-actions'

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

export function ReportDialog({ targetType, targetId, open, onClose }: ReportDialogProps) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (!open) return null

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
      if (result.success) {
        setSubmitted(true)
      } else {
        setError(result.error ?? 'Something went wrong')
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={handleClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200/60 dark:border-gray-800/60 p-6 max-w-sm mx-4 w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {submitted ? (
          <>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50 mb-2">
              Report submitted
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-5 leading-relaxed">
              Report submitted. Our team will review it.
            </p>
            <div className="flex justify-end">
              <button
                onClick={handleClose}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50 mb-2">
              Report {targetType}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
              Why are you reporting this? Select the reason that best applies.
            </p>

            {/* Reason radio buttons */}
            <div className="space-y-2 mb-4">
              {REASONS.map((r) => (
                <label
                  key={r.value}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                    reason === r.value
                      ? 'border-indigo-300 bg-indigo-50/50 dark:border-indigo-700 dark:bg-indigo-950/30'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="accent-indigo-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{r.label}</span>
                </label>
              ))}
            </div>

            {/* Details textarea */}
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Additional details (optional)"
              rows={3}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 resize-none mb-4"
            />

            {/* Error message */}
            {error && (
              <p className="text-xs text-red-500 mb-3">{error}</p>
            )}

            {/* Buttons */}
            <div className="flex gap-2 justify-end">
              <button
                onClick={handleClose}
                className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={!reason || isPending}
                onClick={handleSubmit}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isPending ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
