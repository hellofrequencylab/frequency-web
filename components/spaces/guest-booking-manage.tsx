'use client'

import { useMemo, useState, useTransition, type ReactNode } from 'react'
import { CalendarCheck, CalendarClock, CalendarX, Loader2 } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { choiceTileClasses } from '@/components/ui/choice-tile'
import { isError } from '@/lib/action-result'
import {
  cancelGuestBookingAction,
  listGuestRescheduleSlotsAction,
  rescheduleGuestBookingAction,
} from '@/lib/spaces/booking-actions'
import type { OpenSlot } from '@/lib/spaces/booking'
import type { GuestManageView } from '@/lib/spaces/booking-guest-manage'
import { groupSlotsByDay, timezoneLabel } from '@/lib/spaces/booking-format'
import { cn } from '@/lib/utils'

// A WEBSITE GUEST'S MANAGE PAGE (BOOK-007). The link in their booking emails opens this. Opening it changes
// nothing (SCAN-858): Cancel and Move are buttons that post the guest's secret with this page's Space id. Shared
// by the website's page (app/hosted/[host]/manage-booking) and the Frequency fallback
// (app/(main)/spaces/[slug]/manage-booking). Times show in the Space's booking timezone, labeled.
//
// COPY: camp-counselor voice, no em dashes, no hex, no word about Frequency (the website is the owner's).

type Ready = Extract<GuestManageView, { ok: true }>

export function GuestManageBooking({
  token,
  spaceId,
  view,
  bookHref,
}: {
  token: string
  spaceId: string
  view: GuestManageView
  bookHref: string
}) {
  if (!view.ok) {
    return (
      <Panel icon="x" title="That link did not work.">
        <p className="mt-1 mb-4 text-body-sm text-muted">
          It may be incomplete, or from an older email. Use the link in the latest email about your booking.
        </p>
        <a href={bookHref} className={buttonClasses('primary', 'md')}>
          Pick a time
        </a>
      </Panel>
    )
  }
  return <ManageReady token={token} spaceId={spaceId} view={view} bookHref={bookHref} />
}

function Panel({ icon, title, children }: { icon: 'check' | 'x' | 'clock'; title: string; children?: ReactNode }) {
  const Icon = icon === 'check' ? CalendarCheck : icon === 'x' ? CalendarX : CalendarClock
  return (
    <div className="rounded-card border border-border bg-surface px-6 py-8 text-center">
      <Icon className="mx-auto mb-3 h-8 w-8 text-muted" aria-hidden />
      <p className="text-body-sm font-semibold text-text">{title}</p>
      {children}
    </div>
  )
}

function ManageReady({ token, spaceId, view, bookHref }: { token: string; spaceId: string; view: Ready; bookHref: string }) {
  const [startsAt, setStartsAt] = useState(view.startsAt)
  const [state, setState] = useState(view.state)
  const [moved, setMoved] = useState(false)
  const [mode, setMode] = useState<'idle' | 'cancel' | 'move'>('idle')
  const [reason, setReason] = useState('')
  const [slots, setSlots] = useState<OpenSlot[] | null>(null)
  const [selected, setSelected] = useState<OpenSlot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [loading, startLoad] = useTransition()

  const whenFmt = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        timeZone: view.timezone,
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
    [view.timezone],
  )
  const timeFmt = useMemo(
    () => new Intl.DateTimeFormat('en-US', { timeZone: view.timezone, hour: 'numeric', minute: '2-digit' }),
    [view.timezone],
  )
  const days = useMemo(() => (slots ? groupSlotsByDay(slots, view.timezone) : []), [slots, view.timezone])
  const tzLabel = timezoneLabel(view.timezone)
  const title = view.serviceName ?? `Session with ${view.spaceName}`
  const when = `${whenFmt.format(new Date(startsAt))} (${tzLabel})`

  if (state === 'cancelled') {
    return (
      <Panel icon="x" title="This booking is cancelled.">
        <p className="mt-1 text-body-sm text-text">{title}</p>
        <p className="mt-1 mb-4 text-body-sm text-muted">{when}</p>
        <a href={bookHref} className={buttonClasses('primary', 'md')}>
          Book another time
        </a>
      </Panel>
    )
  }
  if (state === 'awaiting') {
    return (
      <Panel icon="clock" title="This booking is not confirmed yet.">
        <p className="mt-1 text-body-sm text-muted">Use the Confirm button in your first email to keep this time.</p>
      </Panel>
    )
  }
  if (state === 'past') {
    return (
      <Panel icon="clock" title="This time has passed.">
        <p className="mt-1 text-body-sm text-text">{title}</p>
        <p className="mt-1 mb-4 text-body-sm text-muted">{when}</p>
        <a href={bookHref} className={buttonClasses('primary', 'md')}>
          Book another time
        </a>
      </Panel>
    )
  }

  function openMove() {
    setMode('move')
    setError(null)
    setSelected(null)
    setSlots(null)
    startLoad(async () => {
      setSlots(await listGuestRescheduleSlotsAction(token, spaceId))
    })
  }

  function doCancel() {
    setError(null)
    start(async () => {
      const result = await cancelGuestBookingAction(token, spaceId, reason.trim() || null)
      if (isError(result)) {
        setError(result.error)
        return
      }
      setState('cancelled')
    })
  }

  function doMove() {
    if (!selected) return
    const target = selected
    setError(null)
    start(async () => {
      const result = await rescheduleGuestBookingAction(token, spaceId, target.startsAt)
      if (isError(result)) {
        setError(result.error)
        return
      }
      setStartsAt(result.data.startsAt)
      setMoved(true)
      setMode('idle')
      setSlots(null)
      setSelected(null)
    })
  }

  return (
    <div className="space-y-4">
      <div
        className={cn(
          'rounded-card border px-6 py-6 text-center',
          moved ? 'border-success/30 bg-success-bg' : 'border-border bg-surface',
        )}
        role={moved ? 'status' : undefined}
      >
        <CalendarCheck className={cn('mx-auto mb-3 h-8 w-8', moved ? 'text-success' : 'text-muted')} aria-hidden />
        {moved && <p className="text-body-sm font-semibold text-text">Your booking is moved.</p>}
        <p className="text-body-sm font-semibold text-text">{title}</p>
        <p className="mt-1 text-body-sm text-muted">{when}</p>
        {moved && <p className="mt-1 text-body-sm text-muted">A new confirmation, with a calendar file, is on its way.</p>}
      </div>

      {error && (
        <p className="rounded-card bg-danger-bg px-3 py-2 text-body-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      {!view.canModify && !moved ? (
        <p className="text-center text-body-sm text-muted">
          This booking is too close to its start time to change here. Contact {view.spaceName} directly.
        </p>
      ) : mode === 'idle' ? (
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={openMove} className={buttonClasses('primary', 'md')}>
            Move to another time
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('cancel')
              setError(null)
            }}
            className={buttonClasses('secondary', 'md')}
          >
            Cancel booking
          </button>
        </div>
      ) : mode === 'cancel' ? (
        <div className="space-y-3 rounded-card border border-border bg-surface p-4">
          <label htmlFor="guest-cancel-reason" className="text-body-sm font-medium text-muted">
            Reason (optional)
          </label>
          <Input
            id="guest-cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={doCancel} disabled={pending} className={buttonClasses('primary', 'md')}>
              {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> : null}
              Yes, cancel it
            </button>
            <button type="button" onClick={() => setMode('idle')} disabled={pending} className={buttonClasses('secondary', 'md')}>
              Keep my booking
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 rounded-card border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-body-sm font-semibold text-text">Pick a new time</p>
            <button type="button" onClick={() => setMode('idle')} className="text-body-sm font-semibold text-muted hover:text-text">
              Close
            </button>
          </div>
          <p className="text-meta text-muted">Times shown in {tzLabel}.</p>
          {loading || slots === null ? (
            <div className="flex items-center gap-2 text-body-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading times
            </div>
          ) : slots.length === 0 ? (
            <p className="text-body-sm text-muted">No other open times right now. Try again later.</p>
          ) : (
            <div className="space-y-4">
              {days.map((day) => (
                <div key={day.key}>
                  <h3 className="mb-2 text-body-sm font-bold tracking-tight text-text">{day.label}</h3>
                  <div className="flex flex-wrap gap-2">
                    {day.slots.map((slot) => {
                      const active = selected?.startsAt === slot.startsAt
                      return (
                        <button
                          key={slot.startsAt}
                          type="button"
                          onClick={() => setSelected(active ? null : slot)}
                          aria-pressed={active}
                          className={choiceTileClasses(
                            active,
                            cn('rounded-control px-3 py-1.5 text-body-sm font-semibold tabular-nums', active ? 'text-primary-strong' : 'text-text'),
                          )}
                        >
                          {timeFmt.format(new Date(slot.startsAt))}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {selected && (
            <button type="button" onClick={doMove} disabled={pending} className={buttonClasses('primary', 'md')}>
              {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> : null}
              Move to {whenFmt.format(new Date(selected.startsAt))}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
