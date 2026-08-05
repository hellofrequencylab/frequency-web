'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, X } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { cancelEnrollment } from '@/lib/spaces/enroll-actions'

// CANCEL AN ENROLLMENT (client). Calls the cancelEnrollment server action (the member who enrolled or
// a space admin may cancel; the server is the gate). On success it refreshes so the surface flips back
// (or drops the member from the owner list). A confirm step guards an accidental tap. The `label` +
// `align` props let the same button read "Remove" in the owner list (default) and "Cancel enrollment"
// on the member enroll surface, without duplicating the action wiring. No em or en dashes
// (CONTENT-VOICE §10).

export function EnrollmentCancelButton({
  enrollmentId,
  label = 'Remove',
  align = 'end',
}: {
  enrollmentId: string
  /** The resting button text. Owner list shows "Remove"; the member surface shows "Cancel enrollment". */
  label?: string
  /** Horizontal alignment of the stacked button + error. */
  align?: 'end' | 'center'
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function cancel() {
    setError(null)
    start(async () => {
      const result = await cancelEnrollment(enrollmentId)
      if (isError(result)) {
        setError(result.error)
        setConfirming(false)
        return
      }
      router.refresh()
    })
  }

  if (confirming) {
    return (
      <span className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-lg border border-danger px-2.5 py-1 text-meta font-semibold text-danger transition-colors hover:bg-danger-bg disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          Confirm
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="text-meta font-semibold text-muted transition-colors hover:text-text"
        >
          Keep
        </button>
      </span>
    )
  }

  return (
    <span
      className={`flex shrink-0 flex-col gap-1 ${align === 'center' ? 'items-center' : 'items-end'}`}
    >
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-meta font-semibold text-muted transition-colors hover:border-danger/40 hover:text-danger"
      >
        <X className="h-3.5 w-3.5" aria-hidden /> {label}
      </button>
      {error && <span className="text-2xs font-medium text-danger">{error}</span>}
    </span>
  )
}
