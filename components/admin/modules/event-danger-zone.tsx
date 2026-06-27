'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import {
  getEventAdminData,
  setEventCancelled,
  deleteEvent,
} from '@/app/(main)/events/admin-actions'
import { DangerDelete } from '@/components/admin/danger-delete'

// The event Cancel + Delete box, pulled OUT of EventSettingsModule so the settings panel
// can render it BELOW the Layout editor (the "layout picker") — the destructive controls
// sit at the very bottom of the drawer, under everything else. Self-loads the event admin
// data and re-gates server-side via the same actions, so it renders nothing unless the
// viewer may edit the event (host / staff / circle operator).

type EventData = NonNullable<Awaited<ReturnType<typeof getEventAdminData>>>

export function EventDangerZone() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/events\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<EventData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // Two-step inline confirm for Cancel (Reinstate stays one tap).
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  useEffect(() => {
    if (!slug) return
    let active = true
    getEventAdminData(slug)
      .then((d) => {
        if (active) setData(d)
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
    <div className="space-y-4 rounded-2xl border border-danger/30 bg-danger-bg/20 p-4">
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
      <div>
        <p className="text-sm font-semibold text-danger">
          {data.is_cancelled ? 'This event is cancelled' : 'Cancel this event'}
        </p>
        <p className="mt-0.5 text-xs text-muted">
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
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:border-border-strong disabled:opacity-40"
          >
            Reinstate event
          </button>
        ) : !confirmingCancel ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirmingCancel(true)}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-danger/40 bg-surface px-3 py-1.5 text-xs font-semibold text-danger transition-colors hover:bg-danger-bg disabled:opacity-40"
          >
            Cancel event
          </button>
        ) : (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-danger">Cancel this event?</span>
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
              className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
            >
              Yes, cancel it
            </button>
            <button
              type="button"
              onClick={() => setConfirmingCancel(false)}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-text"
            >
              Keep it
            </button>
          </div>
        )}
      </div>

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
