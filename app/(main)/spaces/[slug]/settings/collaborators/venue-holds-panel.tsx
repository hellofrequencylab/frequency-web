'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check, X, CalendarPlus } from 'lucide-react'
import { isError, type ActionResult } from '@/lib/action-result'
import {
  requestVenueHold,
  acceptVenueHold,
  declineVenueHold,
  cancelVenueHold,
} from '../../venue-actions'

// SHARED VENUE HOLDS (client, B3). Coordinate use of a collaborator's venue: request a hold, and (as the
// venue owner) approve/decline incoming requests. A hold is advisory only, so this never touches real
// bookings. No em dashes (CONTENT-VOICE §10).

type Hold = {
  id: string
  status: 'pending' | 'accepted' | 'declined' | 'cancelled'
  role: 'venue' | 'requester'
  partner: { id: string; slug: string; name: string }
  title: string
  startsAt: string
  endsAt: string
  awaitingMyApproval: boolean
}

/** Format an ISO instant in the viewer's local zone with native Intl (no project tz lib on the client). */
function when(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(d)
  } catch {
    return ''
  }
}

const STATUS_LABEL: Record<Hold['status'], string> = {
  pending: 'Pending',
  accepted: 'Confirmed',
  declined: 'Declined',
  cancelled: 'Cancelled',
}

export function VenueHoldsPanel({
  spaceId,
  collaborators,
  holds,
}: {
  spaceId: string
  collaborators: { id: string; slug: string; name: string }[]
  holds: Hold[]
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const [venueId, setVenueId] = useState(collaborators[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')

  const incoming = holds.filter((h) => h.awaitingMyApproval)
  // Active = confirmed holds, plus pending ones I am NOT the approver of (my own outgoing
  // requests). A pending request FOR my venue lives in `incoming` above, so excluding
  // awaitingMyApproval here stops it rendering twice with two conflicting controls.
  const active = holds.filter(
    (h) => h.status === 'accepted' || (h.status === 'pending' && !h.awaitingMyApproval),
  )
  // Declined holds, so a requester sees their ask was turned down instead of it vanishing.
  const declined = holds.filter((h) => h.status === 'declined')

  // Local-time floor for the datetime inputs + client-side window validation (the server
  // stays the authority; this just catches end-before-start and past times inline).
  const nowLocal = (() => {
    const d = new Date()
    d.setSeconds(0, 0)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  })()
  const endBeforeStart = !!startsAt && !!endsAt && endsAt <= startsAt
  const startInPast = !!startsAt && startsAt < nowLocal
  const windowInvalid = endBeforeStart || startInPast

  function run(fn: () => Promise<ActionResult<unknown>>, after?: () => void) {
    setError(null)
    start(async () => {
      const res = await fn()
      if (isError(res)) {
        setError(res.error)
        return
      }
      after?.()
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {/* Incoming requests on THIS space's venue. */}
      {incoming.length > 0 && (
        <div className="rounded-2xl border border-primary bg-surface p-5 shadow-sm">
          <h3 className="text-sm font-bold text-text">Requests for your venue</h3>
          <ul className="mt-3 space-y-3">
            {incoming.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text">{h.title}</p>
                  <p className="text-xs text-muted">
                    {h.partner.name} · {when(h.startsAt)} to {when(h.endsAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => acceptVenueHold(h.id))}
                    className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-on-primary hover:bg-primary-hover disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden /> Approve
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => declineVenueHold(h.id))}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:bg-surface-elevated disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden /> Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Request to use a collaborator's venue. */}
      {collaborators.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <h3 className="text-sm font-bold text-text">Request a venue</h3>
          <p className="mt-1 text-xs text-muted">
            Ask a space you collaborate with to hold their venue for you. They approve the time. This is a
            coordination hold, not a customer booking.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-text">
              Venue
              <select
                value={venueId}
                onChange={(e) => setVenueId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text"
              >
                {collaborators.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-text">
              What for
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Sound bath, popup, class..."
                className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text"
              />
            </label>
            <label className="text-xs font-semibold text-text">
              Start
              <input
                type="datetime-local"
                value={startsAt}
                min={nowLocal}
                onChange={(e) => setStartsAt(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text"
              />
            </label>
            <label className="text-xs font-semibold text-text">
              End
              <input
                type="datetime-local"
                value={endsAt}
                min={startsAt || nowLocal}
                onChange={(e) => setEndsAt(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text"
              />
            </label>
          </div>
          {windowInvalid && (
            <p className="mt-2 text-xs font-medium text-danger">
              {endBeforeStart ? 'End time needs to be after the start.' : 'Pick a start time in the future.'}
            </p>
          )}
          <button
            type="button"
            disabled={pending || !venueId || !title.trim() || !startsAt || !endsAt || windowInvalid}
            onClick={() =>
              run(
                () => requestVenueHold(spaceId, venueId, { title: title.trim(), startsAt, endsAt }),
                () => {
                  setTitle('')
                  setStartsAt('')
                  setEndsAt('')
                },
              )
            }
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary hover:bg-primary-hover disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CalendarPlus className="h-4 w-4" aria-hidden />}
            Send request
          </button>
        </div>
      )}

      {/* The current holds (pending + accepted), either side, with cancel. */}
      {active.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <h3 className="text-sm font-bold text-text">Venue holds</h3>
          <ul className="mt-3 space-y-3">
            {active.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text">{h.title}</p>
                  <p className="text-xs text-muted">
                    {h.role === 'venue' ? `${h.partner.name} at your venue` : `Your hold at ${h.partner.name}`} ·{' '}
                    {when(h.startsAt)} to {when(h.endsAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-semibold text-subtle">
                    {STATUS_LABEL[h.status]}
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (!window.confirm('Cancel this venue hold? The other space is notified it is off.')) return
                      run(() => cancelVenueHold(h.id))
                    }}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:bg-surface-elevated disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Declined holds, so a turned-down request stays visible (re-send from the form above). */}
      {declined.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <h3 className="text-sm font-bold text-text">Declined</h3>
          <ul className="mt-3 space-y-3">
            {declined.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text">{h.title}</p>
                  <p className="text-xs text-muted">
                    {h.role === 'venue' ? `${h.partner.name} at your venue` : `Your hold at ${h.partner.name}`} ·{' '}
                    {when(h.startsAt)} to {when(h.endsAt)}
                  </p>
                </div>
                <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-semibold text-subtle">
                  {STATUS_LABEL[h.status]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p className="text-2xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
