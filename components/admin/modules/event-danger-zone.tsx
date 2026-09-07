'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import {
  getEventAdminData,
  setEventCancelled,
  cancelEventSeries,
  getSeriesCancelPlan,
  deleteEvent,
  type SeriesCancelSummary,
} from '@/app/(main)/events/admin-actions'
import { DangerDelete } from '@/components/admin/danger-delete'

// The event Cancel + Delete box, pulled OUT of EventSettingsModule so the settings panel
// can render it BELOW the Layout editor (the "layout picker") — the destructive controls
// sit at the very bottom of the drawer, under everything else. Self-loads the event admin
// data and re-gates server-side via the same actions, so it renders nothing unless the
// viewer may edit the event (host / staff / circle operator).

type EventData = NonNullable<Awaited<ReturnType<typeof getEventAdminData>>>
type SeriesPlan = Awaited<ReturnType<typeof getSeriesCancelPlan>>

/** What the operator is told after a series cancel. Every bucket the action reports gets a line:
 *  a bulk money action that says only "done" is the one that hides the four dates it could not
 *  touch. Plain sentences, no em dashes (docs/CONTENT-VOICE.md). */
function seriesOutcomeLines(r: SeriesCancelSummary): string[] {
  const lines: string[] = []
  lines.push(
    r.cancelled === 0
      ? 'No dates needed cancelling.'
      : `Cancelled ${r.cancelled} ${r.cancelled === 1 ? 'date' : 'dates'}. Refunds are on their way for every paid ticket.`,
  )
  if (r.alreadyCancelled > 0) lines.push(`${r.alreadyCancelled} were already cancelled and were left alone.`)
  if (r.skipped > 0) lines.push(`${r.skipped} belong to someone else and were skipped.`)
  if (r.failed > 0) lines.push(`${r.failed} could not be cancelled. They are still on the calendar, so try again.`)
  if (r.needsAttention > 0) {
    lines.push(
      `${r.needsAttention} were cancelled but their refunds did not queue. Open each date's Manage page to see what is still owed.`,
    )
  }
  if (r.truncated) lines.push('This series is longer than one pass. Run it again to finish the remaining dates.')
  return lines
}

export function EventDangerZone() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/events\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<EventData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // Two-step inline confirm for Cancel (Reinstate stays one tap).
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  // The series half (SERIES-CANCEL, LIVE-198). Its own confirm, because it is a different and much
  // bigger action than cancelling the one date the operator is looking at.
  const [series, setSeries] = useState<SeriesPlan | null>(null)
  const [confirmingSeries, setConfirmingSeries] = useState(false)
  const [seriesOutcome, setSeriesOutcome] = useState<string[] | null>(null)

  useEffect(() => {
    if (!slug) return
    let active = true
    getEventAdminData(slug)
      .then((d) => {
        if (!active) return
        setData(d)
        if (!d) return
        // The plan is a second round trip on purpose: it needs the event id, and it must never be
        // able to delay or break the Cancel/Delete controls above it.
        getSeriesCancelPlan(d.id)
          .then((p) => {
            if (active) setSeries(p)
          })
          .catch(() => {
            /* no plan → the series control simply does not render */
          })
      })
      .catch(() => {
        /* not permitted / load failed → render nothing */
      })
    return () => {
      active = false
    }
  }, [slug])

  if (!slug || !data) return null

  return (
    <div className="space-y-4 rounded-card border border-danger/30 bg-danger-bg/20 p-4">
      {error && <p className="text-meta font-medium text-danger">{error}</p>}
      <div>
        <p className="text-body-sm font-semibold text-danger">
          {data.is_cancelled ? 'This event is cancelled' : 'Cancel this event'}
        </p>
        <p className="mt-0.5 text-meta text-muted">
          {data.is_cancelled
            ? 'It is off the calendar. Reinstate it to bring it back.'
            : 'Takes it off the calendar without losing it. RSVPs and check-ins stay intact.'}
        </p>
        {data.is_cancelled ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await setEventCancelled(data.id, data.slug, false)
                  setError(null)
                  setData((d) => (d ? { ...d, is_cancelled: false } : d))
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Could not update the event. Try again.')
                }
              })
            }
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-1.5 text-meta font-semibold text-text transition-colors hover:border-border-strong disabled:opacity-40"
          >
            Reinstate event
          </button>
        ) : !confirmingCancel ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirmingCancel(true)}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-control border border-danger/40 bg-surface px-3 py-1.5 text-meta font-semibold text-danger transition-colors hover:bg-danger-bg disabled:opacity-40"
          >
            Cancel event
          </button>
        ) : (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="text-meta font-medium text-danger">Cancel this event?</span>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  try {
                    await setEventCancelled(data.id, data.slug, true)
                    setError(null)
                    setData((d) => (d ? { ...d, is_cancelled: true } : d))
                    setConfirmingCancel(false)
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Could not update the event. Try again.')
                  }
                })
              }
              className="inline-flex items-center gap-1.5 rounded-control bg-danger px-3 py-1.5 text-meta font-semibold text-on-danger transition-colors hover:opacity-90 disabled:opacity-50"
            >
              Yes, cancel it
            </button>
            <button
              type="button"
              onClick={() => setConfirmingCancel(false)}
              className="rounded-control px-2.5 py-1.5 text-meta font-medium text-muted transition-colors hover:text-text"
            >
              Keep it
            </button>
          </div>
        )}
      </div>

      {series?.recurring && series.cancellable >= 2 && (
        <div className="border-t border-danger/20 pt-4">
          <p className="text-body-sm font-semibold text-danger">Cancel the rest of this series</p>
          <p className="mt-0.5 text-meta text-muted">
            Takes all {series.cancellable} dates still to come off the calendar in one go, and refunds every
            paid ticket on them. Dates that already happened are left as they are.
          </p>
          {seriesOutcome ? (
            <ul className="mt-2.5 space-y-1">
              {seriesOutcome.map((line) => (
                <li key={line} className="text-meta text-muted">
                  {line}
                </li>
              ))}
            </ul>
          ) : !confirmingSeries ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirmingSeries(true)}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-control border border-danger/40 bg-surface px-3 py-1.5 text-meta font-semibold text-danger transition-colors hover:bg-danger-bg disabled:opacity-40"
            >
              Cancel {series.cancellable} remaining dates
            </button>
          ) : (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="text-meta font-medium text-danger">
                Cancel all {series.cancellable} dates and refund their tickets?
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      const summary = await cancelEventSeries(data.id, data.slug)
                      setError(null)
                      setSeriesOutcome(seriesOutcomeLines(summary))
                      setConfirmingSeries(false)
                      if (summary.cancelled > 0) setData((d) => (d ? { ...d, is_cancelled: true } : d))
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Could not cancel the series. Try again.')
                    }
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-control bg-danger px-3 py-1.5 text-meta font-semibold text-on-danger transition-colors hover:opacity-90 disabled:opacity-50"
              >
                Yes, cancel every date
              </button>
              <button
                type="button"
                onClick={() => setConfirmingSeries(false)}
                className="rounded-control px-2.5 py-1.5 text-meta font-medium text-muted transition-colors hover:text-text"
              >
                Keep them
              </button>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-danger/20 pt-4">
        <DangerDelete
          entity="event"
          warning="Permanently removes the event and all its RSVPs and check-ins. To take it off the calendar without losing it, use Cancel instead."
          onDelete={() => deleteEvent(data.id, data.slug)}
          redirectTo="/events"
          confirmText="DELETE"
          chromeless
        />
      </div>
    </div>
  )
}
