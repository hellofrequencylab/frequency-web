'use client'

// Journeys v2 — the Meeting section's "Create Event" control (ADR-302, owner's item 14). Lets the
// author tie a Journey's meeting to a real Event: either LINK one of their own events (a picker of
// the caller's hosted events, read owner-gated) or open the event creator to make a new one. The
// chosen event's id is stored in meeting.eventId via setJourneyMeeting (owned by the parent panel).
//
// Scope note: a full in-popup create is out of scope here — creating an event needs a circle scope,
// geocoding, and paid/steward gating (see app/(main)/events/new). So "create" opens /events/new in a
// new tab; once the event exists, the author links it here. Linking is the in-panel path.

import { useEffect, useState, useTransition } from 'react'
import { CalendarPlus, Link2, Plus, X, ExternalLink, RefreshCw } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { isError } from '@/lib/action-result'
import { listMyJourneyEvents, getJourneyMeetingEvent, type JourneyEventOption } from '@/app/(main)/journeys/actions'

/** Short, friendly date for an event chip (e.g. "Sun, Jun 22"). Empty for an undated/parse-fail. */
function formatEventDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function JourneyEventLink({
  planId,
  eventId,
  onChange,
}: {
  planId: string
  /** The currently-linked event id (meeting.eventId), or null. */
  eventId: string | null
  /** Persist the new linked event id (null to unlink) through the parent's setJourneyMeeting. */
  onChange: (eventId: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  // The resolved linked event (title + when) for the chip. Loaded when a link exists.
  const [linked, setLinked] = useState<JourneyEventOption | null>(null)
  const [, startResolve] = useTransition()

  // Resolve the linked event's details whenever the linked id changes, so the chip shows its title
  // and date. A missing event (deleted) resolves to null — the chip then offers to unlink.
  useEffect(() => {
    // The chip only renders when eventId is set (below), so no need to clear linked here — that
    // would be a synchronous setState in the effect body. Just resolve when there is an id.
    if (!eventId) return
    let alive = true
    startResolve(async () => {
      const res = await getJourneyMeetingEvent(planId, eventId)
      if (alive && !isError(res)) setLinked(res.data.event)
    })
    return () => {
      alive = false
    }
  }, [planId, eventId])

  return (
    <div className="flex flex-col gap-1">
      <span className="text-2xs font-medium text-subtle">Event</span>

      {eventId ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary-bg px-2.5 py-1.5">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-primary-strong">
            <CalendarPlus className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 truncate">
              {linked ? linked.title : 'Linked event'}
              {linked && formatEventDate(linked.startsAt) ? (
                <span className="text-muted"> · {formatEventDate(linked.startsAt)}</span>
              ) : null}
              {linked === null ? <span className="text-muted"> · no longer available</span> : null}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {linked && (
              <a
                href={`/events/${linked.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md p-1 text-muted transition-colors hover:bg-surface-elevated hover:text-text"
                aria-label="Open event in a new tab"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <button
              type="button"
              onClick={() => onChange(null)}
              className="rounded-md p-1 text-muted transition-colors hover:bg-surface-elevated hover:text-text"
              aria-label="Unlink this event"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm font-medium text-muted transition-colors hover:text-text"
        >
          <CalendarPlus className="h-4 w-4" aria-hidden /> Link or create an event
        </button>
      )}

      <p className="text-2xs text-subtle">Tie this Journey to an event so people know when to gather.</p>

      <EventPickerDialog
        planId={planId}
        open={open}
        onClose={() => setOpen(false)}
        onPick={(id) => {
          onChange(id)
          setOpen(false)
        }}
      />
    </div>
  )
}

/** The link-or-create popup: a list of the caller's hosted events to pick from, plus a clear path to
 *  create a new one (opens /events/new in a new tab). Loads the events lazily on open. */
function EventPickerDialog({
  planId,
  open,
  onClose,
  onPick,
}: {
  planId: string
  open: boolean
  onClose: () => void
  onPick: (eventId: string) => void
}) {
  const [events, setEvents] = useState<JourneyEventOption[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startLoad] = useTransition()

  // Load the picker's events each time it opens (so a freshly created event shows on reopen). The
  // fetch + setState live inside the transition callback AFTER the await, not synchronously in the
  // effect body, so they don't trigger cascading renders.
  useEffect(() => {
    if (!open) return
    let alive = true
    startLoad(async () => {
      const res = await listMyJourneyEvents(planId)
      if (!alive) return
      if (isError(res)) {
        setError(res.error)
        setEvents([])
      } else {
        setError(null)
        setEvents(res.data.events)
      }
    })
    return () => {
      alive = false
    }
  }, [open, planId])

  // Manual refresh (the Refresh button). A click handler, so the reset is fine here.
  const reload = () => {
    startLoad(async () => {
      const res = await listMyJourneyEvents(planId)
      if (isError(res)) {
        setError(res.error)
        setEvents([])
      } else {
        setError(null)
        setEvents(res.data.events)
      }
    })
  }

  return (
    <Dialog open={open} onClose={onClose} ariaLabel="Link or create an event" className="max-w-md">
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-text">Link an event</h2>
            <p className="mt-0.5 text-sm text-muted">Pick one of your events, or create a new one.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted transition-colors hover:bg-surface-elevated hover:text-text"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-1.5">
          {events === null && (
            <div className="flex items-center gap-2 px-1 py-6 text-sm text-muted">
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> Loading your events
            </div>
          )}

          {events !== null && error && (
            <p className="px-1 py-3 text-sm text-warning">{error}</p>
          )}

          {events !== null && !error && events.length === 0 && (
            <p className="px-1 py-3 text-sm text-muted">You don&apos;t host any events yet. Create one to link it here.</p>
          )}

          {events !== null && events.length > 0 && (
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {events.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => onPick(e.id)}
                    className="flex w-full items-center gap-2 rounded-lg border border-border bg-canvas px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-primary-bg"
                  >
                    <Link2 className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-text">{e.title}</span>
                      {formatEventDate(e.startsAt) && (
                        <span className="block text-2xs text-subtle">{formatEventDate(e.startsAt)}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <a
            href="/events/new"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-canvas px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
          >
            <Plus className="h-4 w-4" aria-hidden /> Create an event
          </a>
          <button
            type="button"
            onClick={reload}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted transition-colors hover:text-text"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Refresh
          </button>
        </div>
      </div>
    </Dialog>
  )
}
