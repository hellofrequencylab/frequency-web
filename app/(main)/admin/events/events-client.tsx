'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelEventSeriesScoped, toggleCancelEvent } from '../actions'
import { DangerModal } from '@/components/admin/danger-modal'

/** One line per bucket the series cancel reports (LIVE-206). A bulk money action that only says
 *  "done" is the one that hides the dates it could not reach. */
export function describeSeriesCancel(s: {
  cancelled: number
  alreadyCancelled: number
  skipped: number
  failed: number
  needsAttention: number
  truncated: boolean
}): string {
  const parts = [`${s.cancelled} date${s.cancelled === 1 ? '' : 's'} cancelled`]
  if (s.alreadyCancelled) parts.push(`${s.alreadyCancelled} already cancelled`)
  if (s.skipped) parts.push(`${s.skipped} skipped (not yours to cancel)`)
  if (s.failed) parts.push(`${s.failed} failed and still live`)
  if (s.needsAttention) parts.push(`${s.needsAttention} cancelled but refunds need attention on the event page`)
  if (s.truncated) parts.push('the series is long; run it again to finish')
  return parts.join(' · ') + '.'
}

export function CancelToggle({
  id,
  isCancelled,
  isSeries = false,
}: {
  id: string
  isCancelled: boolean
  /** True when the row belongs to a repeating event, so the whole series can be cancelled at once. */
  isSeries?: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [seriesOpen, setSeriesOpen] = useState(false)
  const [seriesNote, setSeriesNote] = useState<string | null>(null)
  const router = useRouter()

  function commit() {
    startTransition(async () => {
      await toggleCancelEvent(id, !isCancelled)
    })
  }

  function commitSeries() {
    startTransition(async () => {
      try {
        setSeriesNote(describeSeriesCancel(await cancelEventSeriesScoped(id)))
        router.refresh()
      } catch (err) {
        setSeriesNote(err instanceof Error ? err.message : 'Could not cancel the series.')
      }
    })
  }

  function handleClick() {
    // Reinstating is restorative — do it straight away. Cancelling notifies members,
    // so gate it behind the danger modal (named button, safe default).
    if (isCancelled) {
      commit()
      return
    }
    setConfirmOpen(true)
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={isPending}
        className={`shrink-0 rounded-lg border px-3 py-1.5 text-meta font-medium transition-colors disabled:opacity-50 ${
          isCancelled
            ? 'border-success text-success hover:bg-success-bg dark:hover:bg-success-bg/30'
            : 'border-danger text-danger hover:bg-danger-bg'
        }`}
      >
        {isPending ? '…' : isCancelled ? 'Reinstate' : 'Cancel'}
      </button>
      {isSeries && !isCancelled && (
        <button
          type="button"
          onClick={() => setSeriesOpen(true)}
          disabled={isPending}
          className="shrink-0 rounded-lg border border-danger px-3 py-1.5 text-meta font-medium text-danger transition-colors hover:bg-danger-bg disabled:opacity-50"
          title="Cancel every remaining date of this repeating event"
        >
          Cancel series
        </button>
      )}
      {seriesNote && (
        <p role="status" className="basis-full text-meta text-subtle">
          {seriesNote}
        </p>
      )}
      <DangerModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Cancel this event?"
        body="Members will see it as cancelled. You can reinstate it afterward."
        confirmLabel="Cancel event"
        onConfirm={commit}
      />
      <DangerModal
        open={seriesOpen}
        onClose={() => setSeriesOpen(false)}
        title="Cancel every remaining date of this series?"
        body="Takes every date still to come off the calendar in one go and refunds their tickets. Dates that have already happened are left alone. Each date can be reinstated afterward, one at a time."
        confirmLabel="Cancel the series"
        onConfirm={commitSeries}
      />
    </>
  )
}
